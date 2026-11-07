<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Functional\Service;

use PHPUnit\Framework\Attributes\Test;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;
use Webconsulting\VisualEditorEnhancements\Service\FrontendConfiguration;

/**
 * The install-wide recipe for the user settings: Core merges User TSconfig
 * setup.override.* into $BE_USER->uc on every login initialisation
 * (BackendUserAuthentication::backendSetUC -> overrideUC), which is what
 * FrontendConfiguration and InlineRecordConfiguration read. setup.default.*
 * seeds only an empty uc, so an existing user keeps the backfilled TCA default.
 */
final class UserSettingsOverrideTest extends FunctionalTestCase
{
    protected array $testExtensionsToLoad = ['friendsoftypo3/visual-editor', 'webconsulting/visual-editor-enhancements'];

    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__ . '/../Middleware/Fixtures/be_users.csv');
        $this->importCSVDataSet(__DIR__ . '/../Middleware/Fixtures/pages.csv');
        $this->getConnectionPool()->getConnectionForTable('be_groups')->insert('be_groups', ['uid' => 20, 'pid' => 0, 'title' => 'Editors',
            'TSconfig' => "setup.override.tx_visualeditor_actionLabels = icons\nsetup.override.tx_visualeditor_inlineRecords = 1\nsetup.default.tx_visualeditor_entriesLayout = tray"]);
        // An editor who logged in before: uc already holds every TCA default.
        $this->getConnectionPool()->getConnectionForTable('be_users')->update('be_users', ['usergroup' => '20', 'uc' => serialize([
            'tx_visualeditor_actionLabels' => 'caption', 'tx_visualeditor_inlineRecords' => 0, 'tx_visualeditor_entriesLayout' => 'inspector',
        ])], ['uid' => 2]);
    }

    #[Test]
    public function setupOverrideReachesAnExistingUserAndSetupDefaultDoesNot(): void
    {
        $user = $this->setUpBackendUser(2);
        self::assertSame(['icons', '1', 'inspector'], [$user->uc['tx_visualeditor_actionLabels'], $user->uc['tx_visualeditor_inlineRecords'], $user->uc['tx_visualeditor_entriesLayout']]);

        $configuration = $this->get(FrontendConfiguration::class)->build(666);
        self::assertSame('icons', $configuration['actionLabelMode']);
        self::assertTrue($configuration['inlineRecordsEnabled']);
        self::assertSame('inspector', $configuration['entriesLayout'], 'setup.default does not reach a user whose uc is filled');
        $stored = unserialize((string)$this->getConnectionPool()->getConnectionForTable('be_users')->select(['uc'], 'be_users', ['uid' => 2])->fetchOne(), ['allowed_classes' => false]);
        self::assertSame('icons', $stored['tx_visualeditor_actionLabels'], 'Core writes the override back to be_users.uc');
    }
}
