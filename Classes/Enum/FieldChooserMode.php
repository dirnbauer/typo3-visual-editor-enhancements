<?php

declare(strict_types=1);

namespace Webconsulting\VisualEditorEnhancements\Enum;

/**
 * How the field chooser presents an element's settings, chosen per backend
 * user (User settings > Visual editor). The backing value is what be_users.uc
 * stores and what the edit frame receives as `fieldChooserMode`.
 */
enum FieldChooserMode: string
{
    /** FormEngine-style tab bar, one tab per form tab (default). */
    case Tabs = 'tabs';
    /** One scrolling list with the form's section headings. */
    case Sections = 'sections';
    case Disabled = 'disabled';

    /**
     * A missing or unknown user setting means the default, not "off".
     */
    public static function fromUserSetting(mixed $value): self
    {
        return is_string($value) ? (self::tryFrom($value) ?? self::Tabs) : self::Tabs;
    }
}
