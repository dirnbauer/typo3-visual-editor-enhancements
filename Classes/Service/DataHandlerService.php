<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Service;

use RuntimeException;
use TYPO3\CMS\Core\DataHandling\DataHandler;
use TYPO3\CMS\Core\Schema\TcaSchemaFactory;
use TYPO3\CMS\Core\Utility\GeneralUtility;

use function in_array;
use function is_array;
use function is_int;
use function is_string;
use function preg_match;

final readonly class DataHandlerService
{
    public function __construct(
        private TcaSchemaFactory $tcaSchema,
    ) {
    }

    /**
     * @param array<string, array<int|string, array<string, bool|int|float|string>>> $data
     * @param array<string, array<int, array<string, mixed>>> $cmd
     *
     * @return list<string>
     */
    public function run(array $data, array $cmd): array
    {
        $this->validateData($data);
        $this->validateCmd($cmd);

        $dataHandler = GeneralUtility::makeInstance(DataHandler::class);
        $dataHandler->start($data, $cmd);
        $dataHandler->process_datamap();
        $dataHandler->process_cmdmap();
        return $dataHandler->errorLog;
    }

    private function validateData(mixed $data): void
    {
        if (!is_array($data)) {
            throw new RuntimeException('Data must be an array of table names to rows', 5781185589);
        }

        foreach ($data as $table => $rows) {
            if (!is_array($rows)) {
                throw new RuntimeException('Rows for table "' . $table . '" must be an array of uid to fields', 8680448759);
            }

            $schema = $this->tcaSchema->get($table);
            foreach ($rows as $uid => $fields) {
                $isNewRecord = is_string($uid) && preg_match('/^NEW[a-zA-Z0-9]+$/', $uid) === 1;
                if (!is_int($uid) && !$isNewRecord) {
                    throw new RuntimeException('Uid for table "' . $table . '" must be an integer or a NEW... placeholder, got ' . $uid, 1117271113);
                }

                foreach ($fields as $field => $value) {
                    if ($field === 'pid' && $isNewRecord) {
                        // pid is consumed by DataHandler for NEW records, it is not a TCA column.
                        continue;
                    }
                    if (!$schema->hasField($field)) {
                        throw new RuntimeException('Field "' . $field . '" not found in TCA schema for table "' . $table . '"', 6627872218);
                    }
                }
            }
        }
    }

    private function validateCmd(mixed $cmd): void
    {
        if (!is_array($cmd)) {
            throw new RuntimeException('Data must be an array of table names to rows', 4576273831);
        }

        foreach ($cmd as $table => $rows) {
            if (!is_array($rows)) {
                throw new RuntimeException('Rows for table "' . $table . '" must be an array of uid to fields', 4705592477);
            }

            foreach ($rows as $uid => $actions) {
                if (!is_int($uid)) {
                    throw new RuntimeException('Uid for table "' . $table . '" must be an integer, got ' . $uid, 3903416059);
                }

                foreach ($actions as $actionName => $actionData) {
                    if (!in_array($actionName, ['move', 'copy', 'delete'], true)) {
                        throw new RuntimeException('Unknown action "' . $actionName . '" for table "' . $table . '" and uid ' . $uid, 7473736544);
                    }
                }
            }
        }
    }
}
