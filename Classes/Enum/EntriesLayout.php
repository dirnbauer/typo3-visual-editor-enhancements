<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Enum;

/**
 * Where the entries inspector of a content element opens, chosen per backend
 * user (User settings > Visual editor > Entries panel, stored as be_users.uc
 * tx_visualeditor_entriesLayout). The backing value is what the edit frame
 * receives as `entriesLayout`; the placement itself is done by the field
 * chooser component (Frontend/components/ve-field-chooser.js).
 */
enum EntriesLayout: string
{
    /** Docked at the right edge of the preview (default). */
    case Inspector = 'inspector';
    /** Fixed at the bottom, full width - suits side-by-side language frames. */
    case Tray = 'tray';
    /** A popover under the element's action bar that scrolls with it. */
    case Anchored = 'anchored';

    /**
     * A missing or unknown user setting means the default.
     */
    public static function fromUserSetting(mixed $value): self
    {
        return is_string($value) ? (self::tryFrom($value) ?? self::Inspector) : self::Inspector;
    }
}
