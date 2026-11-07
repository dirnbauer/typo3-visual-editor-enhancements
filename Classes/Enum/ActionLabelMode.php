<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Enum;

/**
 * How the buttons of a content element's action bar show their names, chosen
 * per backend user (User settings > Visual editor > Action bar labels, stored
 * as be_users.uc tx_visualeditor_actionLabels). The backing value is what the
 * edit frame receives as `actionLabelMode`; the label stylesheet for each
 * mode is built by Shared/action-bar-label-css.js.
 */
enum ActionLabelMode: string
{
    /** The pointed, focused or clicked button's name in a reserved row below the bar (default). */
    case Caption = 'caption';
    /** Every button's name beside its icon while the bar is shown. */
    case Inline = 'inline';
    /** Every button's name under its icon while the bar is shown. */
    case Stacked = 'stacked';
    /** The vendor look: icons with native tooltips. */
    case Icons = 'icons';

    /**
     * A missing or unknown user setting means the default.
     */
    public static function fromUserSetting(mixed $value): self
    {
        return is_string($value) ? (self::tryFrom($value) ?? self::Caption) : self::Caption;
    }
}
