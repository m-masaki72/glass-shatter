export class GamePanels {
  constructor({ host, cancel }) {
    this.host = host;
    this.cancel = cancel;
    this.active = null;
    this.returnFocus = null;
    this.dialogs = new Map(
      ['compose', 'records', 'settings'].map((name) => [name, document.querySelector(`#${name}-panel`)]),
    );
    this.viewPanel = document.querySelector('#view-panel');
    for (const button of document.querySelectorAll('[data-open-panel]'))
      button.addEventListener('click', () => this.open(button.dataset.openPanel, button));
    for (const button of document.querySelectorAll('[data-close-panel]'))
      button.addEventListener('click', () => this.close());
    for (const dialog of this.dialogs.values()) {
      dialog.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        const focusable = [
          ...dialog.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((element) => element.checkVisibility() && element.tabIndex >= 0);
        const first = focusable[0],
          last = focusable.at(-1);
        if (!first) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        this.close();
      });
      dialog.addEventListener('close', () => {
        if (this.active !== dialog) return;
        this.active = null;
        const target = this.returnFocus;
        this.returnFocus = null;
        if (target?.isConnected && target.checkVisibility()) target.focus({ preventScroll: true });
        else this.host.focus({ preventScroll: true });
      });
      let outsideDown = false;
      const outside = (event) => {
        const box = dialog.getBoundingClientRect();
        return (
          event.target === dialog &&
          (event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom)
        );
      };
      dialog.addEventListener('pointerdown', (event) => {
        outsideDown = event.button === 0 && outside(event);
      });
      dialog.addEventListener('click', (event) => {
        if (outsideDown && outside(event)) this.close();
        outsideDown = false;
      });
    }
    this.viewPanel.querySelector('summary').addEventListener('click', () => cancel());
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.viewPanel.open || this.viewPanel.contains(event.target)) return;
        this.viewPanel.open = false;
        cancel();
        if (host.contains(event.target)) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true,
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Escape' || !this.viewPanel.open || this.active?.open) return;
        this.viewPanel.open = false;
        cancel();
        this.viewPanel.querySelector('summary').focus({ preventScroll: true });
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );
  }
  open(name, opener = document.activeElement) {
    const dialog = this.dialogs.get(name);
    if (!dialog || this.active === dialog) return;
    this.cancel();
    this.viewPanel.open = false;
    if (this.active?.open) this.active.close();
    this.active = dialog;
    this.returnFocus = opener;
    dialog.showModal();
    const target =
      name === 'compose' ? dialog.querySelector('#stage-prompt') : dialog.querySelector('[data-close-panel]');
    target?.focus({ preventScroll: true });
  }
  close(focusTarget) {
    if (focusTarget) this.returnFocus = focusTarget;
    if (this.active?.open) this.active.close();
  }
}
