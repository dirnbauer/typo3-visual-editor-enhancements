<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Tests\Unit\Service;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Schema\TcaSchema;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;
use Webconsulting\VisualEditorEnhancements\Service\DataHandlerService;

/**
 * The payload validation that guards the overriding /visual-editor/save
 * endpoint. The whole reason this package overrides the upstream service is
 * the NEW… placeholder: the element library inserts a record that does not
 * exist yet, which upstream's is_int($uid) check rejects. Everything else must
 * stay as strict as upstream.
 *
 * The run() path itself is not unit tested - it is a DataHandler round trip and
 * belongs in a functional test - so the tests below drive validation through
 * the exceptions it throws before any DataHandler is created.
 */
final class DataHandlerServiceTest extends TestCase
{
    #[Test]
    public function newRecordPlaceholdersAreAccepted(): void
    {
        // Reaching DataHandler means validation passed; in a unit context the
        // DataHandler then fails on the missing TYPO3 runtime, which is not a
        // validation error and carries none of the validation error codes.
        $this->expectExceptionCodeIsNotOneOf(
            ['tt_content' => ['NEWabc123' => ['CType' => 'text', 'pid' => 3]]],
            [1117271113, 6627872218],
        );
    }

    #[Test]
    public function pidIsAllowedOnNewRecordsAlthoughItIsNoTcaColumn(): void
    {
        $this->expectExceptionCodeIsNotOneOf(
            ['tt_content' => ['NEWabc123' => ['pid' => 3]]],
            [6627872218],
        );
    }

    #[Test]
    public function pidIsStillRejectedOnExistingRecords(): void
    {
        $this->expectValidationFailure(
            ['tt_content' => [12 => ['pid' => 3]]],
            6627872218,
        );
    }

    /**
     * @return iterable<string, array{array<string, mixed>, int}>
     */
    public static function invalidDataProvider(): iterable
    {
        yield 'rows are not an array' => [['tt_content' => 'nope'], 8680448759];
        yield 'uid is neither int nor NEW placeholder' => [['tt_content' => ['12abc' => ['CType' => 'text']]], 1117271113];
        yield 'NEW placeholder with a dash is not a placeholder' => [['tt_content' => ['NEW-abc' => ['CType' => 'text']]], 1117271113];
        yield 'unknown field' => [['tt_content' => [12 => ['not_a_column' => 'x']]], 6627872218];
    }

    /**
     * @param array<string, mixed> $data
     */
    #[Test]
    #[DataProvider('invalidDataProvider')]
    public function invalidPayloadsAreRejected(array $data, int $expectedCode): void
    {
        $this->expectValidationFailure($data, $expectedCode);
    }

    /**
     * @return iterable<string, array{array<string, mixed>, int}>
     */
    public static function invalidCommandProvider(): iterable
    {
        yield 'rows are not an array' => [['tt_content' => 'nope'], 4705592477];
        yield 'uid is not an int' => [['tt_content' => ['NEWabc' => ['move' => 1]]], 3903416059];
        yield 'unknown action' => [['tt_content' => [12 => ['publish' => 1]]], 7473736544];
    }

    /**
     * @param array<string, mixed> $cmd
     */
    #[Test]
    #[DataProvider('invalidCommandProvider')]
    public function invalidCommandsAreRejected(array $cmd, int $expectedCode): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionCode($expectedCode);

        $this->createService()->run([], $cmd);
    }

    /**
     * @param array<string, mixed> $data
     */
    private function expectValidationFailure(array $data, int $expectedCode): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionCode($expectedCode);

        $this->createService()->run($data, []);
    }

    /**
     * @param array<string, mixed> $data
     * @param list<int> $validationCodes
     */
    private function expectExceptionCodeIsNotOneOf(array $data, array $validationCodes): void
    {
        try {
            $this->createService()->run($data, []);
            // Validation passed and the DataHandler round trip happened to
            // survive without a TYPO3 runtime - also a pass for this test.
            self::addToAssertionCount(1);
        } catch (\Throwable $throwable) {
            self::assertNotContains(
                $throwable->getCode(),
                $validationCodes,
                'Payload was rejected by validation: ' . $throwable->getMessage(),
            );
        }
    }

    private function createService(): DataHandlerService
    {
        $schema = self::createStub(TcaSchema::class);
        $schema->method('hasField')->willReturnCallback(
            static fn(string $field): bool => in_array($field, ['CType', 'header', 'bodytext', 'colPos'], true),
        );
        $schemaFactory = self::createStub(TcaSchemaFactory::class);
        $schemaFactory->method('get')->willReturn($schema);

        return new DataHandlerService($schemaFactory);
    }
}
