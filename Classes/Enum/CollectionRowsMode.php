<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Enum;

/**
 * How collection entries ("rows") can be changed on the page itself, chosen
 * per backend user (User settings > Visual editor > Entries on the page,
 * stored as be_users.uc tx_visualeditor_collectionRows). The backing value is
 * what the edit frame receives as `collectionRows`; the on-page layer itself
 * is Frontend/row-layer.js. Only entries whose template carries the
 * f:mark.item markers get on-page controls; the entries panel stays the
 * keyboard-complete path in every mode.
 */
enum CollectionRowsMode: string
{
    /** Entries are changed in the entries panel only (default). */
    case Panel = 'panel';
    /** The panel, plus one "Add <entry>" button after the last entry on the page. */
    case Appender = 'appender';
    /** The panel, the add button and a small row toolbar on the hovered or focused entry. */
    case Rows = 'rows';

    /**
     * A missing or unknown user setting means the default.
     */
    public static function fromUserSetting(mixed $value): self
    {
        return is_string($value) ? (self::tryFrom($value) ?? self::Panel) : self::Panel;
    }
}
