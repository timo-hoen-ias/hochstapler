// Bildschirmtastatur für Texteingaben per Controller (Name, Raumcode).
// Öffnet sich mit Ⓐ auf einem Textfeld. Ⓐ Taste · Ⓧ löschen · Ⓨ Leerzeichen/Zufällig · Ⓑ schließen · Start fertig.
// Auch mit Maus/Touch bedienbar; echte Tastatur tippt weiterhin ins Feld.

const LAYOUTS = {
  name: {
    title: 'Dein Name',
    rows: ['1234567890', 'qwertzuiopü', 'asdfghjklöä', 'yxcvbnm-_.'],
    extra: [['shift', '⇧ Groß'], ['space', 'Leerzeichen'], ['del', '⌫'], ['done', 'Fertig']],
    filter: (s) => s,
    yLabel: 'Leerzeichen',
  },
  room: {
    title: 'Raumcode',
    rows: ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ0123', '456789'],
    extra: [['random', 'Zufällig'], ['del', '⌫'], ['done', 'Fertig']],
    filter: (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    yLabel: 'Zufällig',
  },
};

export class OnScreenKeyboard {
  constructor({ random, sfx }) {
    this.random = random; // () => neuer Raumcode
    this.sfx = sfx;
    this.input = null;
    this.upper = false;
    this.el = document.createElement('div');
    this.el.id = 'osk';
    this.el.className = 'osk hidden';
    this.el.setAttribute('role', 'dialog');
    this.el.innerHTML = `<div class="osk-card">
      <div class="osk-head"><span class="osk-title"></span><span class="osk-field"><span class="osk-text"></span><i class="osk-caret"></i></span></div>
      <div class="osk-keys"></div>
      <div class="osk-hint"></div>
    </div>`;
    document.body.appendChild(this.el);
    this.keysEl = this.el.querySelector('.osk-keys');
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) { this.press(b.dataset.k); return; }
      if (e.target === this.el) this.close(); // Klick neben die Tastatur
    });
    // Echte Tastatur, solange die Bildschirmtastatur offen ist
    addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      let k = null;
      if (e.key === 'Escape') k = 'close';
      else if (e.key === 'Enter' && document.activeElement?.closest?.('#osk') && document.activeElement.tagName === 'BUTTON') return; // Enter klickt den fokussierten Knopf
      else if (e.key === 'Enter') k = 'done';
      else if (e.key === 'Backspace') k = 'del';
      else if (e.key.length === 1) k = e.key === ' ' ? 'space' : 'c:' + e.key;
      if (!k) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.press(k, true);
    }, true);
  }

  isOpen() { return !this.el.classList.contains('hidden'); }

  open(input, { onDone } = {}) {
    this.input = input;
    this.onDone = onDone;
    this.kind = input.id === 'room' ? 'room' : 'name';
    this.layout = LAYOUTS[this.kind];
    this.upper = this.kind === 'name' && !input.value;
    this.build();
    this.el.classList.remove('hidden');
    this.refresh();
    this.keysEl.querySelector('button')?.focus({ preventScroll: true });
  }

  close(done = false) {
    if (!this.isOpen()) return;
    this.el.classList.add('hidden');
    const input = this.input;
    this.input = null;
    if (done && this.onDone) this.onDone(input);
    else input?.focus({ preventScroll: true });
  }

  build() {
    const L = this.layout;
    this.keysEl.innerHTML = '';
    this.keysEl.dataset.kind = this.kind;
    for (const row of L.rows) {
      const r = document.createElement('div');
      r.className = 'osk-row';
      for (const ch of row) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.k = 'c:' + ch;
        b.dataset.ch = ch;
        r.appendChild(b);
      }
      this.keysEl.appendChild(r);
    }
    const r = document.createElement('div');
    r.className = 'osk-row osk-extra';
    for (const [k, label] of L.extra) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.k = k;
      b.className = 'osk-' + k;
      b.textContent = label;
      r.appendChild(b);
    }
    this.keysEl.appendChild(r);
    this.el.querySelector('.osk-title').textContent = L.title;
    this.el.querySelector('.osk-hint').innerHTML =
      `<span><b>A</b> Taste</span><span><b>X</b> Löschen</span><span><b>Y</b> ${L.yLabel}</span><span><b>B</b> Schließen</span><span><b>Start</b> Fertig</span>`;
  }

  refresh() {
    if (!this.input) return;
    for (const b of this.keysEl.querySelectorAll('[data-ch]')) {
      const ch = b.dataset.ch;
      b.textContent = this.kind === 'name' && this.upper ? ch.toUpperCase() : ch;
    }
    this.keysEl.querySelector('[data-k=shift]')?.classList.toggle('on', this.upper);
    this.el.querySelector('.osk-text').textContent = this.input.value;
    this.el.querySelector('.osk-field').classList.toggle('empty', !this.input.value);
  }

  set(v) {
    const max = Number(this.input.maxLength) > 0 ? Number(this.input.maxLength) : 16;
    this.input.value = this.layout.filter(v).slice(0, max);
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // k: 'c:<Zeichen>' | shift | space | del | random | done | close
  press(k, fromKeyboard = false) {
    if (!this.input || !k) return;
    const v = this.input.value;
    if (k.startsWith('c:')) {
      let ch = k.slice(2);
      if (!fromKeyboard && this.kind === 'name' && this.upper) ch = ch.toUpperCase();
      this.set(v + ch);
      if (this.kind === 'name' && this.upper && !fromKeyboard) this.upper = false; // nur der erste Buchstabe groß
    } else if (k === 'space') {
      if (this.kind === 'room') return this.press('random', fromKeyboard);
      if (v && !v.endsWith(' ')) { this.set(v + ' '); this.upper = true; }
    } else if (k === 'del') {
      this.set(v.slice(0, -1));
      if (this.kind === 'name') this.upper = !this.input.value || this.input.value.endsWith(' ');
    } else if (k === 'shift') {
      this.upper = !this.upper;
    } else if (k === 'random') {
      if (this.kind === 'room') this.set(this.random());
    } else if (k === 'done') {
      this.sfx.click();
      this.close(true);
      return;
    } else if (k === 'close') {
      this.sfx.back();
      this.close();
      return;
    }
    this.sfx.move();
    this.refresh();
  }
}
