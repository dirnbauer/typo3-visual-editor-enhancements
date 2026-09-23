<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\EventListener;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\CMS\Core\TypoScript\TypoScriptService;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\VisualEditor\Events\ModifyNewContentElementWizardUrlParameterEvent;
use Webconsulting\VisualEditorEnhancements\EventListener\NewContentWizardParameterListener;
use Webconsulting\VisualEditorEnhancements\Tests\Unit\PageTsConfigPriming;

/**
 * The listener is the only supported way this package influences the URL of
 * the "new content element" wizard the Visual Editor opens (extension point
 * added upstream in 1.10.0). What must hold: the editor's own placeholders
 * survive, TSconfig wins where it names the same key, and without TSconfig
 * nothing changes at all.
 */
final class NewContentWizardParameterListenerTest extends TestCase
{
    use PageTsConfigPriming;

    #[\Override]
    protected function setUp(): void
    {
        parent::setUp();
        $this->registerRuntimeCache();
    }

    #[\Override]
    protected function tearDown(): void
    {
        GeneralUtility::purgeInstances();
        parent::tearDown();
    }

    #[Test]
    public function parametersAreUntouchedWithoutTsConfig(): void
    {
        $this->primePageTsConfig(666, '');
        $event = $this->createEvent();

        ($this->createListener())($event);

        self::assertSame($this->defaultParameters(), $event->getParameters());
    }

    #[Test]
    public function nestedTsConfigBecomesNestedUrlParameters(): void
    {
        $this->primePageTsConfig(666, <<<'TYPOSCRIPT'
            tx_visualeditorenhancements.newContentWizard.parameters {
              defVals.tt_content.header_layout = 2
              defVals.tt_content.space_before_class = large
            }
            TYPOSCRIPT);
        $event = $this->createEvent();

        ($this->createListener())($event);

        self::assertSame(
            ['tt_content' => ['header_layout' => '2', 'space_before_class' => 'large']],
            $event->getParameters()['defVals'],
        );
    }

    #[Test]
    public function theVisualEditorPlaceholdersSurvive(): void
    {
        $this->primePageTsConfig(666, 'tx_visualeditorenhancements.newContentWizard.parameters.defVals.tt_content.header_layout = 2');
        $event = $this->createEvent();

        ($this->createListener())($event);

        $parameters = $event->getParameters();
        self::assertSame('__COL_POS__', $parameters['colPos']);
        self::assertSame('__UID_PID__', $parameters['uid_pid']);
        self::assertSame('/typo3/module/web/edit', $parameters['returnUrl']);
        self::assertSame(666, $parameters['id']);
    }

    #[Test]
    public function tsConfigWinsOverAParameterOfTheSameName(): void
    {
        $this->primePageTsConfig(666, 'tx_visualeditorenhancements.newContentWizard.parameters.returnUrl = /typo3/module/web/list');
        $event = $this->createEvent();

        ($this->createListener())($event);

        self::assertSame('/typo3/module/web/list', $event->getParameters()['returnUrl']);
    }

    /**
     * Without a resolvable page id there is no TSconfig scope, so the listener
     * must not guess one.
     */
    #[Test]
    public function noPageIdMeansNoChange(): void
    {
        $event = new ModifyNewContentElementWizardUrlParameterEvent(
            ['colPos' => '__COL_POS__'],
            [],
            new ServerRequest('https://example.com/'),
        );

        ($this->createListener())($event);

        self::assertSame(['colPos' => '__COL_POS__'], $event->getParameters());
    }

    private function createListener(): NewContentWizardParameterListener
    {
        return new NewContentWizardParameterListener(new TypoScriptService());
    }

    private function createEvent(): ModifyNewContentElementWizardUrlParameterEvent
    {
        return new ModifyNewContentElementWizardUrlParameterEvent(
            $this->defaultParameters(),
            [],
            new ServerRequest('https://example.com/?editMode=1'),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function defaultParameters(): array
    {
        return [
            'id' => 666,
            'colPos' => '__COL_POS__',
            'uid_pid' => '__UID_PID__',
            'returnUrl' => '/typo3/module/web/edit',
        ];
    }
}
