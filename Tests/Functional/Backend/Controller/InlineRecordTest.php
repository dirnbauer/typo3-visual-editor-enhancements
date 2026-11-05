<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\Core\Core\SystemEnvironmentBuilder;
use TYPO3\CMS\Core\DataHandling\DataHandler;
use TYPO3\CMS\Core\FormProtection\FormProtectionFactory;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;
use Webconsulting\VisualEditorEnhancements\Backend\Controller\PersistenceController;
use Webconsulting\VisualEditorEnhancements\Service\EditorRecordContext;
use Webconsulting\VisualEditorEnhancements\Service\FieldOptionsService;
use Webconsulting\VisualEditorEnhancements\Service\InlineRecordService;

final class InlineRecordTest extends FunctionalTestCase
{
    protected array $coreExtensionsToLoad = ['rte_ckeditor'];
    protected array $testExtensionsToLoad = [
        'friendsoftypo3/visual-editor', 'webconsulting/visual-editor-enhancements',
        __DIR__ . '/../../../../vendor/typo3/cms-workspaces',
        __DIR__ . '/../../Fixtures/Extensions/inline_fixture',
    ];

    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__ . '/../../Middleware/Fixtures/be_users.csv');
        $this->importCSVDataSet(__DIR__ . '/../../Middleware/Fixtures/pages.csv');
        $this->importCSVDataSet(__DIR__ . '/../../Middleware/Fixtures/tt_content.csv');
        $this->setUpBackendUser(1);
        $GLOBALS['LANG'] = $this->get(\TYPO3\CMS\Core\Localization\LanguageServiceFactory::class)->createFromUserPreferences($GLOBALS['BE_USER']);
        $GLOBALS['BE_USER']->uc['tx_visualeditor_inlineRecords'] = 1;
        $GLOBALS['BE_USER']->workspace = 0;
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->insert('tx_vee_item', [
            'uid' => 1, 'pid' => 666, 'title' => 'Existing', 'owner' => 1, 'owner_table' => 'tt_content', 'slot' => 'items', 'sorting' => 10,
        ]);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['vee_items' => 1], ['uid' => 1]);
        $GLOBALS['TYPO3_REQUEST'] = $this->request();
    }

    #[Test]
    public function repeatedCreateDeleteAndStaleRevisionRespectLimits(): void
    {
        $first = $this->field();
        self::assertSame([1], $first['uids']);
        $created = $this->act($first, 'create');
        self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        self::assertSame(1, (int)$this->row($created[1]['uid'])['hidden']);
        self::assertSame('New entry', $this->row($created[1]['uid'])['title']);
        self::assertSame(409, $this->act($first, 'create')[0], 'A double click cannot create a second row');
        self::assertSame(200, $this->act($this->field(), 'create', 1)[0]);
        self::assertFalse($this->field()['canCreate']);
        self::assertSame(409, $this->act($this->field(), 'create')[0]);
        self::assertSame(200, $this->act($this->field(), 'delete', $created[1]['uid'])[0]);
        self::assertSame(1, (int)$this->row($created[1]['uid'])['deleted']);
        self::assertSame(200, $this->act($this->field(), 'delete', $this->field()['uids'][1])[0]);
        self::assertFalse($this->field()['children'][0]['canDelete']);
        self::assertSame(409, $this->act($this->field(), 'delete', 1)[0]);
    }

    #[Test]
    public function sharedTableOwnershipAndUnknownAfterTargetAreRejected(): void
    {
        $connection = $this->getConnectionPool()->getConnectionForTable('tx_vee_item');
        $connection->insert('tx_vee_item', ['uid' => 9, 'pid' => 666, 'owner' => 1, 'owner_table' => 'tt_content', 'slot' => 'shared', 'title' => 'Other relation']);
        self::assertSame(409, $this->act($this->field(), 'delete', 9)[0]);
        self::assertSame(409, $this->act($this->field(), 'create', 9)[0]);
        self::assertSame(0, (int)$this->row(9)['deleted']);
    }

    #[Test]
    public function preferenceAndInstallFlagAreRecheckedOnWrite(): void
    {
        $field = $this->field();
        $GLOBALS['BE_USER']->uc['tx_visualeditor_inlineRecords'] = 0;
        self::assertSame(403, $this->act($field, 'create')[0]);
        $GLOBALS['BE_USER']->uc['tx_visualeditor_inlineRecords'] = 1;
        $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['visual_editor_enhancements']['inlineRecordsEnabled'] = false;
        self::assertSame(403, $this->act($field, 'create')[0]);
        self::assertCount(1, $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->executeQuery('SELECT uid FROM tx_vee_item')->fetchAllAssociative());
    }

    #[Test]
    public function existingChildFieldsAndLibraryCreateStayCompatibleButOwnerWritesAreDenied(): void
    {
        self::assertSame(200, $this->save(['data' => ['tx_vee_item' => [1 => ['title' => 'Edited']]]])[0]);
        self::assertSame('Edited', $this->row(1)['title']);
        foreach ([['tx_vee_item' => [1 => ['owner' => 2]]], ['tt_content' => [1 => ['vee_items' => '']]], ['tx_vee_item' => ['NEWx' => ['pid' => 666, 'title' => 'Bypass']]]] as $data) {
            self::assertSame(400, $this->save(['data' => $data])[0]);
        }
        self::assertSame(400, $this->save(['cmdArray' => [['tx_vee_item' => [1 => ['delete' => 1]]]]])[0]);
        self::assertSame(200, $this->save(['data' => ['tt_content' => ['NEWlibrary' => ['pid' => 666, 'CType' => 'text', 'header' => 'Library']]]])[0]);
        self::assertSame(200, $this->save(['cmdArray' => [['tt_content' => [1 => ['copy' => 666]]]]])[0]);
    }

    #[Test]
    public function mixedAndForgedIntentPropertiesAreRejectedBeforeMutation(): void
    {
        $intent = ['action' => 'create', 'parentTable' => 'tt_content', 'parentUid' => 1, 'field' => 'vee_items', 'revision' => $this->field()['revision']];
        self::assertSame(400, $this->save(['inlineRecord' => $intent, 'data' => []])[0]);
        foreach (['childTable' => 'tx_vee_item', 'hidden' => 0, 'pid' => 666, 'liveUid' => 1] as $key => $value) {
            self::assertSame(400, $this->save(['inlineRecord' => [...$intent, $key => $value]])[0]);
        }
        self::assertSame(400, $this->save(['inlineRecord' => [...$intent, 'parentUid' => '1']])[0]);
    }

    #[Test]
    public function failedDataHandlerOperationRollsBackChildAndRelation(): void
    {
        $before = $this->getConnectionPool()->getConnectionForTable('tt_content')->select(['*'], 'tt_content')->fetchAllAssociative();
        $GLOBALS['TYPO3_CONF_VARS']['SC_OPTIONS']['t3lib/class.t3lib_tcemain.php']['processDatamapClass'][] = FailingInlineHook::class;
        self::assertSame(422, $this->act($this->field(), 'create')[0]);
        self::assertCount(1, $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->executeQuery('SELECT uid FROM tx_vee_item')->fetchAllAssociative());
        self::assertSame($before, $this->getConnectionPool()->getConnectionForTable('tt_content')->select(['*'], 'tt_content')->fetchAllAssociative());
    }

    #[Test]
    public function repeatedWorkspaceWritesNeverChangeLiveRows(): void
    {
        $this->getConnectionPool()->getConnectionForTable('sys_workspace')->insert('sys_workspace', ['uid' => 1, 'pid' => 0, 'title' => 'Fixture']);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->delete('tt_content', ['uid' => 2]);
        $GLOBALS['BE_USER']->workspace = 1;
        $beforeParent = BackendUtility::getRecord('tt_content', 1);
        $beforeChild = $this->row(1);
        // Existing FormEngine drafts. Core 14.3.10 first-versioning itself changes
        // live child sorting; the endpoint refuses that unproven path.
        self::assertSame('workspace', $this->field()['createReason']);
        self::assertSame(403, $this->act($this->field(), 'create')[0]);
        $parentDraft = $beforeParent;
        $parentDraft['uid'] = 10;
        $parentDraft['t3ver_oid'] = 1;
        $parentDraft['t3ver_wsid'] = 1;
        $childDraft = $beforeChild;
        $childDraft['uid'] = 10;
        $childDraft['t3ver_oid'] = 1;
        $childDraft['t3ver_wsid'] = 1;
        $this->getConnectionPool()->getConnectionForTable('tt_content')->insert('tt_content', $parentDraft);
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->insert('tx_vee_item', $childDraft);
        self::assertSame($beforeChild, $this->row(1), 'Before create');
        $created = $this->act($this->field(), 'create');
        self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        self::assertSame($beforeChild, $this->row(1), 'After create');
        $created = $this->act($this->field(), 'create');
        self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        self::assertSame($beforeChild, $this->row(1), 'After create');
        $field = $this->field();
        self::assertCount(3, $field['children']);
        self::assertSame(200, $this->act($field, 'delete', $field['children'][1]['uid'])[0]);
        self::assertSame(200, $this->act($this->field(), 'delete', $this->field()['children'][0]['uid'])[0]);
        self::assertSame($beforeParent, BackendUtility::getRecord('tt_content', 1));
        self::assertSame($beforeChild, $this->row(1));
    }

    #[Test]
    public function foreignWorkspaceIdentityAndDeletePlaceholdersAreNotDisclosed(): void
    {
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['t3ver_wsid' => 2], ['uid' => 1]);
        $this->expectException(\TYPO3\CMS\Backend\Form\Exception\DatabaseRecordException::class);
        $this->get(EditorRecordContext::class)->compile('tx_vee_item', 1, $this->request());
    }

    #[Test]
    public function connectedTranslationsAndCascadeChildrenUseBackendFallback(): void
    {
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->insert('tx_vee_item', ['uid' => 2, 'pid' => 666, 'origin' => 1, 'lang' => 1]);
        self::assertSame('translations', $this->field()['children'][0]['deleteReason']);
        $this->getConnectionPool()->getConnectionForTable('tt_content')->update('tt_content', ['l18n_parent' => 2, 'sys_language_uid' => 1], ['uid' => 1]);
        self::assertSame('translation', $this->field()['createReason']);
    }

    #[Test]
    public function typelessTabsAndDisplayConditionsUseResolvedFormData(): void
    {
        $GLOBALS['BE_USER']->uc['tx_visualeditor_fieldChooserMode'] = 'disabled';
        self::assertTrue($this->field()['canCreate'], 'Collection preference is independent of the chooser mode');
        $row = $this->row(1);
        $data = $this->get(FieldOptionsService::class)->buildFieldOptions('tx_vee_item', 1, $row, $this->request(), true);
        self::assertSame('1', $data['recordType']);
        self::assertNotContains('dependent', array_column($data['fields'], 'name'));
        $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->update('tx_vee_item', ['choice' => 'b'], ['uid' => 1]);
        $data = $this->get(FieldOptionsService::class)->buildFieldOptions('tx_vee_item', 1, $row, $this->request(), true);
        self::assertContains('dependent', array_column($data['fields'], 'name'));
        $byName = array_column($data['fields'], null, 'name');
        self::assertNotSame($byName['dependent']['tabId'], $byName['nested']['tabId']);
        self::assertSame($byName['dependent']['tab'], $byName['nested']['tab']);
    }

    #[Test]
    public function restrictedUsersNeedChildAndVisibilityRightsAndPageAccess(): void
    {
        $this->getConnectionPool()->getConnectionForTable('be_groups')->insert('be_groups', [
            'uid' => 10, 'pid' => 0, 'title' => 'Inline editors', 'tables_modify' => 'tt_content,tx_vee_item',
            'db_mountpoints' => '1', 'allowed_languages' => '0,1',
            'explicit_allowdeny' => 'tt_content:CType:text',
        ]);
        $this->getConnectionPool()->getConnectionForTable('be_users')->update('be_users', ['usergroup' => '10', 'workspace_perms' => 1], ['uid' => 2]);
        $this->getConnectionPool()->getConnectionForTable('pages')->update('pages', ['perms_everybody' => 31], ['uid' => 666]);
        $this->getConnectionPool()->getConnectionForTable('pages')->update('pages', ['perms_everybody' => 31], ['uid' => 1]);
        $user = $this->setUpBackendUser(2);
        $user->workspace = 0;
        $user->uc['tx_visualeditor_inlineRecords'] = 1;
        self::assertNotEmpty($user->isInWebMount(666), 'webmount');
        $parent = BackendUtility::getRecord('tt_content', 1);
        self::assertNotNull($parent);
        $access = $user->checkRecordEditAccess('tt_content', $parent);
        self::assertTrue($access->isAllowed, $access->errorMessage);
        self::assertSame('hidden', $this->field()['createReason']);
        $this->getConnectionPool()->getConnectionForTable('be_groups')->update('be_groups', ['non_exclude_fields' => 'tx_vee_item:hidden'], ['uid' => 10]);
        $this->getConnectionPool()->getConnectionForTable('pages')->update('pages', ['perms_everybody' => 31], ['uid' => 1]);
        $user = $this->setUpBackendUser(2);
        $user->workspace = 0;
        $user->uc['tx_visualeditor_inlineRecords'] = 1;
        self::assertTrue($this->field()['canCreate']);
        $created = $this->act($this->field(), 'create');
        self::assertSame(200, $created[0], json_encode($created, JSON_THROW_ON_ERROR));
        $this->getConnectionPool()->getConnectionForTable('be_groups')->update('be_groups', ['tables_modify' => 'tt_content'], ['uid' => 10]);
        $denied = $this->setUpBackendUser(2);
        $denied->workspace = 0;
        $denied->uc['tx_visualeditor_inlineRecords'] = 1;
        $form = $this->get(EditorRecordContext::class)->compile('tt_content', 1, $this->request());
        self::assertSame([], $this->get(InlineRecordService::class)->fields('tt_content', $form, $this->request()));
        $this->getConnectionPool()->getConnectionForTable('pages')->update('pages', ['editlock' => 1], ['uid' => 666]);
        $this->expectException(\TYPO3\CMS\Backend\Form\Exception\AccessDeniedException::class);
        $this->field();
    }

    #[Test]
    public function pageRecordNeedsPageEditRatherThanContentEditPermission(): void
    {
        $this->getConnectionPool()->getConnectionForTable('be_groups')->insert('be_groups', [
            'uid' => 10, 'pid' => 0, 'title' => 'Page editor', 'tables_modify' => 'pages',
            'db_mountpoints' => '1', 'allowed_languages' => '0', 'pagetypes_select' => '1',
            'non_exclude_fields' => 'pages:nav_hide',
        ]);
        $this->getConnectionPool()->getConnectionForTable('be_users')->update('be_users', ['usergroup' => '10', 'workspace_perms' => 1], ['uid' => 2]);
        $pages = $this->getConnectionPool()->getConnectionForTable('pages');
        $pages->update('pages', ['perms_everybody' => 31], ['uid' => 1]);
        $pages->update('pages', ['perms_everybody' => 3], ['uid' => 666]);
        $user = $this->setUpBackendUser(2);
        $user->workspace = 0;
        $options = $this->get(FieldOptionsService::class)->buildFieldOptions(
            'pages',
            666,
            BackendUtility::getRecord('pages', 666) ?? [],
            $this->request()
        );
        self::assertContains('nav_hide', array_column($options['fields'], 'name'));
    }

    #[Test]
    public function nestedCollectionWritesUseAuthorizedOwnerAndMatchFields(): void
    {
        $form = $this->get(EditorRecordContext::class)->compile('tx_vee_item', 1, $this->request());
        $fields = $this->get(InlineRecordService::class)->fields('tx_vee_item', $form, $this->request());
        $field = array_column($fields, null, 'name')['nested'];
        $result = $this->save(['inlineRecord' => ['action' => 'create', 'parentTable' => 'tx_vee_item', 'parentUid' => 1,
            'field' => 'nested', 'revision' => $field['revision']]]);
        self::assertSame(200, $result[0], json_encode($result, JSON_THROW_ON_ERROR));
        $child = $this->row($result[1]['uid']);
        self::assertSame('tx_vee_item', $child['owner_table']);
        self::assertSame('nested', $child['slot']);
        self::assertSame(1, (int)$child['owner']);
        self::assertSame('cascade', $this->field()['children'][0]['deleteReason']);
    }

    #[Test]
    public function draftIdentityCompilesActualVersionAndKeepsStoredNonzeroStageEditableForAdmin(): void
    {
        $this->getConnectionPool()->getConnectionForTable('sys_workspace')->insert('sys_workspace', ['uid' => 1, 'pid' => 0, 'title' => 'Fixture']);
        $draft = BackendUtility::getRecord('tt_content', 1);
        $draft['uid'] = 10;
        $draft['t3ver_oid'] = 1;
        $draft['t3ver_wsid'] = 1;
        $draft['t3ver_stage'] = 1;
        $draft['header'] = 'Draft title';
        $this->getConnectionPool()->getConnectionForTable('tt_content')->insert('tt_content', $draft);
        $GLOBALS['BE_USER']->workspace = 1;
        $form = $this->get(EditorRecordContext::class)->compile('tt_content', 1, $this->request());
        self::assertSame(10, $form['compileUid']);
        self::assertSame('Draft title', $form['databaseRow']['header']);
        self::assertSame(1, $form['requestedUid']);
    }

    #[Test]
    public function conflictingRequestReturnsBusyWithoutWrites(): void
    {
        $field = $this->field();
        $lock = $this->get(\TYPO3\CMS\Core\Locking\LockFactory::class)->createLocker(
            'vee-inline:tt_content:1:vee_items',
            \TYPO3\CMS\Core\Locking\LockingStrategyInterface::LOCK_CAPABILITY_EXCLUSIVE | \TYPO3\CMS\Core\Locking\LockingStrategyInterface::LOCK_CAPABILITY_NOBLOCK
        );
        $lock->acquire();
        try {
            $result = $this->act($field, 'create');
            self::assertSame(409, $result[0]);
            self::assertSame('busy', $result[1]['reason']);
        } finally {
            $lock->release();
        }
    }

    private function request(): ServerRequest
    {
        return new ServerRequest('https://vee.test/typo3/ajax/visual-editor/save', 'POST')
            ->withAttribute('applicationType', SystemEnvironmentBuilder::REQUESTTYPE_BE)
            ->withQueryParams(['editMode' => 1]);
    }

    /** @return array<string, mixed> */
    private function field(): array
    {
        $form = $this->get(EditorRecordContext::class)->compile('tt_content', 1, $this->request());
        $fields = $this->get(InlineRecordService::class)->fields('tt_content', $form, $this->request());
        return array_column($fields, null, 'name')['vee_items'];
    }

    /** @param array<string, mixed> $field
     * @return array{int, array<string, mixed>}
     */
    private function act(array $field, string $action, ?int $uid = null): array
    {
        $intent = ['action' => $action, 'parentTable' => 'tt_content', 'parentUid' => 1, 'field' => 'vee_items', 'revision' => $field['revision'] ?? 'unavailable'];
        if ($uid !== null) {
            $intent[$action === 'create' ? 'afterUid' : 'childUid'] = $uid;
        }
        return $this->save(['inlineRecord' => $intent]);
    }

    /** @param array<string, mixed> $payload
     * @return array{int, array<string, mixed>}
     */
    private function save(array $payload): array
    {
        $token = $this->get(FormProtectionFactory::class)->createForType('backend')->generateToken('visual_editor', 'save');
        $request = $this->request()->withParsedBody($payload)->withHeader('X-Request-Token', $token);
        $GLOBALS['TYPO3_REQUEST'] = $request;
        $response = $this->get(PersistenceController::class)->saveAction($request);
        return [$response->getStatusCode(), json_decode((string)$response->getBody(), true)];
    }

    /** @return array<string, mixed> */
    private function row(int $uid): array
    {
        return $this->getConnectionPool()->getConnectionForTable('tx_vee_item')->executeQuery('SELECT * FROM tx_vee_item WHERE uid = ?', [$uid])->fetchAssociative() ?: throw new \RuntimeException('Fixture row missing');
    }
}

final class FailingInlineHook
{
    /** @param array<string, mixed> $fields */
    public function processDatamap_afterDatabaseOperations(string $status, string $table, int|string $id, array $fields, DataHandler $handler): void
    {
        if ($table === 'tx_vee_item') {
            $handler->errorLog[] = 'Injected failure after child write';
        }
    }
}
