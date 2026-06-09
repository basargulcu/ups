# TODO

## Bugs

- [ ] Subnote edit does not save on blur/click-away — only saves on Escape. Needs investigation into why `mousedown` capture listener and `onBlur` both fail to trigger `commitSubnoteEdit` in this context. Correction, editing works fine. A new subnote entry requires "Enter" key to save, unlike a note.
