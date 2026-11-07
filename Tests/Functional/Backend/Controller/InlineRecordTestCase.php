<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Backend\Controller;

use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\Core\Core\SystemEnvironmentBuilder;
use TYPO3\CMS\Core\FormProtection\FormProtectionFactory;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;
use Webconsulting\VisualEditorEnhancements\Backend\Controller\PersistenceController;
use Webconsulting\VisualEditorEnhancements\Service\EditorRecordContext;
use Webconsulting\VisualEditorEnhancements\Service\InlineRecordService;

/**
 * Shared fixture for the collection endpoint: tt_content 1 on page 666 owns
 * tx_vee_item 1 through vee_items (min 1, max 3); tt_content 2 is its connected
 * translation into language 1. Admin (be_users 1) in live by default.
 */
abstract class InlineRecordTestCase extends FunctionalTestCase
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

    protected function restrictedOwnerUser(string $tables, string $nonExcludeFields = 'tx_vee_item:hidden', string $languages = '0'): void
    {
        $conn = $this->getConnectionPool()->getConnectionForTable('be_groups');
        $conn->delete('be_groups', ['uid' => 10]);
        $conn->insert('be_groups', ['uid' => 10, 'pid' => 0, 'title' => 'Owner rights', 'tables_modify' => $tables,
            'db_mountpoints' => '1', 'allowed_languages' => $languages, 'explicit_allowdeny' => 'tt_content:CType:text', 'non_exclude_fields' => $nonExcludeFields]);
        $this->getConnectionPool()->getConnectionForTable('be_users')->update('be_users', ['usergroup' => '10', 'workspace_perms' => 1], ['uid' => 2]);
        foreach ([1, 666] as $pid) {
            $this->getConnectionPool()->getConnectionForTable('pages')->update('pages', ['perms_everybody' => 31], ['uid' => $pid]);
        }
        $user = $this->setUpBackendUser(2);
        $user->workspace = 0;
        $user->uc['tx_visualeditor_inlineRecords'] = 1;
    }

    protected function request(): ServerRequest
    {
        return new ServerRequest('https://vee.test/typo3/ajax/visual-editor/save', 'POST')
            ->withAttribute('applicationType', SystemEnvironmentBuilder::REQUESTTYPE_BE)
            ->withQueryParams(['editMode' => 1]);
    }

    /** @return array<string, mixed> */
    protected function field(string $name = 'vee_items', string $table = 'tt_content', int $uid = 1): array
    {
        $form = $this->get(EditorRecordContext::class)->compile($table, $uid, $this->request());
        $fields = $this->get(InlineRecordService::class)->fields($table, $form, $this->request());
        return array_column($fields, null, 'name')[$name];
    }

    /** @param array<string, mixed> $field
     * @return array{int, array<string, mixed>}
     */
    protected function act(array $field, string $action, ?int $uid = null): array
    {
        $intent = ['action' => $action, 'parentTable' => 'tt_content', 'parentUid' => 1, 'field' => 'vee_items', 'revision' => $field['revision'] ?? 'unavailable'];
        if ($uid !== null) {
            $intent[$action === 'create' ? 'afterUid' : 'childUid'] = $uid;
        }
        return $this->save(['inlineRecord' => $intent]);
    }

    /**
     * @param array<string, mixed> $field
     * @param array<string, mixed> $options extra intent keys (afterUid, childUid, language, mode, ids)
     * @return array{int, array<string, mixed>}
     */
    protected function intent(array $field, string $action, array $options = []): array
    {
        return $this->save(['inlineRecord' => ['action' => $action, 'parentTable' => $field['parentTable'] ?? 'tt_content',
            'parentUid' => $field['parentUid'] ?? 1, 'field' => $field['name'] ?? 'vee_items',
            'revision' => $field['revision'] ?? 'unavailable', ...$options]]);
    }

    /** @param array<string, mixed> $payload
     * @return array{int, array<string, mixed>}
     */
    protected function save(array $payload): array
    {
        $token = $this->get(FormProtectionFactory::class)->createForType('backend')->generateToken('visual_editor', 'save');
        $request = $this->request()->withParsedBody($payload)->withHeader('X-Request-Token', $token);
        $GLOBALS['TYPO3_REQUEST'] = $request;
        $response = $this->get(PersistenceController::class)->saveAction($request);
        return [$response->getStatusCode(), json_decode((string)$response->getBody(), true)];
    }

    /** @return array<string, mixed> */
    protected function row(int $uid, string $table = 'tx_vee_item'): array
    {
        return $this->getConnectionPool()->getConnectionForTable($table)->executeQuery('SELECT * FROM ' . $table . ' WHERE uid = ?', [$uid])->fetchAssociative() ?: throw new \RuntimeException('Fixture row missing');
    }

    /** @return list<array<string, mixed>> */
    protected function rows(string $table = 'tx_vee_item'): array
    {
        return $this->getConnectionPool()->getConnectionForTable($table)->executeQuery('SELECT * FROM ' . $table . ' ORDER BY uid')->fetchAllAssociative();
    }

    protected function useWorkspace(int $id = 1): void
    {
        $connection = $this->getConnectionPool()->getConnectionForTable('sys_workspace');
        if (!$connection->count('*', 'sys_workspace', ['uid' => $id])) {
            $connection->insert('sys_workspace', ['uid' => $id, 'pid' => 0, 'title' => 'Fixture']);
        }
        $GLOBALS['BE_USER']->workspace = $id;
    }

    /**
     * FormEngine-style drafts of the parent and child 1 (as the backend form leaves them).
     */
    protected function draftParentAndChild(int $workspace = 1): void
    {
        foreach (['tt_content' => 1, 'tx_vee_item' => 1] as $table => $uid) {
            $draft = BackendUtility::getRecord($table, $uid) ?? throw new \RuntimeException('Fixture row missing');
            $draft['uid'] = 10;
            $draft['t3ver_oid'] = $uid;
            $draft['t3ver_wsid'] = $workspace;
            $this->getConnectionPool()->getConnectionForTable($table)->insert($table, $draft);
        }
    }

    /**
     * @param array<mixed> $payload
     * @param list<string> $forbidden
     */
    protected static function assertNoKeys(array $payload, array $forbidden, string $path = ''): void
    {
        foreach ($payload as $key => $value) {
            self::assertNotContains((string)$key, $forbidden, 'Internal key leaked at ' . $path . '/' . $key);
            if (is_array($value)) {
                self::assertNoKeys($value, $forbidden, $path . '/' . $key);
            }
        }
    }
}
