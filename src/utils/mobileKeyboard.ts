/**
 * Mobile & Android Soft-Keyboard UX Manager
 *
 * Solves two common Android/iOS web & PWA pain points across the entire app:
 * 1. Forces numeric-only virtual keypads (`inputMode="numeric"` / `inputMode="decimal"` +
 *    `enterKeyHint="done"`) on every `type="number"` / `type="tel"` field—including dynamically
 *    mounted modals and inputs without explicit `inputMode`.
 * 2. Reliably dismisses stuck Android virtual keyboards after autofill ("relleno de datos"),
 *    button/chip/preset clicks, form submits, Enter/Done presses, modal closes (detaching
 *    focused inputs), background taps, and container scrolls.
 */

export interface MobileKeyboardState {
  isOpen: boolean;
  isTouchEnvironment: boolean;
  viewportHeight: number;
  viewportOffsetTop: number;
  activeInputType: string | null;
}

type StateListener = (state: MobileKeyboardState) => void;

const listeners = new Set<StateListener>();
let isInstalled = false;
let lastFocusedEditable: HTMLElement | null = null;
let baselineHeight = 0;
let sentinelEl: HTMLSpanElement | null = null;
let currentState: MobileKeyboardState = {
  isOpen: false,
  isTouchEnvironment: false,
  viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
  viewportOffsetTop: 0,
  activeInputType: null,
};

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
  } catch {}
  return 'ontouchstart' in window || (navigator?.maxTouchPoints || 0) > 0;
}

function isEditableElement(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') {
    const ta = el as HTMLTextAreaElement;
    return !ta.disabled && !ta.readOnly;
  }
  if (tag === 'INPUT') {
    const inp = el as HTMLInputElement;
    if (inp.disabled || inp.readOnly) return false;
    const nonTextTypes = new Set([
      'button',
      'submit',
      'reset',
      'checkbox',
      'radio',
      'file',
      'image',
      'range',
      'color',
      'hidden',
    ]);
    return !nonTextTypes.has((inp.type || 'text').toLowerCase());
  }
  return el.isContentEditable;
}

function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  try {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  } catch {
    return true;
  }
}

function getOrCreateSentinel(): HTMLSpanElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (sentinelEl && sentinelEl.isConnected) return sentinelEl;
  const span = document.createElement('span');
  span.setAttribute('tabindex', '-1');
  span.setAttribute('aria-hidden', 'true');
  span.setAttribute('data-keyboard-sentinel', 'true');
  span.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;';
  document.body.appendChild(span);
  sentinelEl = span;
  return span;
}

function notifyListeners(): void {
  listeners.forEach((cb) => {
    try {
      cb(currentState);
    } catch {}
  });
}

function updateKeyboardState(): void {
  if (typeof window === 'undefined') return;
  const vv = window.visualViewport;
  const vpHeight = vv ? vv.height : window.innerHeight;
  const vpTop = vv ? vv.offsetTop : 0;

  if (!baselineHeight || vpHeight > baselineHeight) {
    baselineHeight = vpHeight;
  }

  const active = document.activeElement;
  const editableActive = isEditableElement(active) ? active : null;
  const touchEnv = isTouchDevice();
  const shrunkByKeyboard = baselineHeight > 0 && vpHeight < baselineHeight - 110;
  const activeType =
    editableActive?.tagName === 'INPUT'
      ? ((editableActive as HTMLInputElement).type || 'text').toLowerCase()
      : editableActive
      ? 'textarea'
      : null;

  const nextOpen =
    Boolean(editableActive) &&
    touchEnv &&
    (shrunkByKeyboard || activeType === 'number' || activeType === 'tel' || window.innerWidth < 1024);

  const changed =
    currentState.isOpen !== nextOpen ||
    currentState.isTouchEnvironment !== touchEnv ||
    Math.abs(currentState.viewportHeight - vpHeight) > 2 ||
    Math.abs(currentState.viewportOffsetTop - vpTop) > 2 ||
    currentState.activeInputType !== activeType;

  if (nextOpen && typeof document !== 'undefined') {
    const bottomOffset = shrunkByKeyboard ? 52 : 82;
    const topPx = Math.max(8, Math.round(vpTop + vpHeight - bottomOffset));
    document.documentElement.style.setProperty('--mobile-kb-top', `${topPx}px`);
  }

  if (changed) {
    currentState = {
      isOpen: nextOpen,
      isTouchEnvironment: touchEnv,
      viewportHeight: vpHeight,
      viewportOffsetTop: vpTop,
      activeInputType: activeType,
    };
    notifyListeners();
  }
}

/**
 * Forces the soft keyboard to dismiss cleanly on Android Chrome, Samsung Internet,
 * Android WebView, and iOS Safari—even if React already unmounted/hid the input.
 */
export function forceDismissMobileKeyboard(): void {
  if (typeof document === 'undefined') return;

  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body && active.tagName !== 'HTML') {
    if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable) {
      try {
        active.blur();
      } catch {}
    }
  }

  if (lastFocusedEditable && lastFocusedEditable !== active) {
    try {
      lastFocusedEditable.blur();
    } catch {}
  }

  // Android Chrome/WebView IME fallback: when a focused input was removed from DOM
  // or ignored `.blur()`, moving focus briefly to a non-editable hidden sentinel
  // signals InputMethodManager to close the soft keyboard reliably.
  if (isTouchDevice()) {
    const stillEditable = isEditableElement(document.activeElement);
    if (stillEditable || (lastFocusedEditable && !lastFocusedEditable.isConnected)) {
      const sentinel = getOrCreateSentinel();
      if (sentinel) {
        try {
          sentinel.focus({ preventScroll: true });
          sentinel.blur();
        } catch {}
      }
    }
  }

  lastFocusedEditable = null;

  window.setTimeout(() => {
    const curr = document.activeElement as HTMLElement | null;
    if (curr && isEditableElement(curr)) {
      try {
        curr.blur();
      } catch {}
    }
    updateKeyboardState();
  }, 40);

  updateKeyboardState();
}

/**
 * Applies `inputMode` (`numeric` vs `decimal` vs `tel`), `pattern`, and `enterKeyHint`
 * to a single `<input>` element if not already explicitly provided.
 */
export function applyNumericKeyboardAttributes(input: HTMLInputElement): void {
  if (!input || input.tagName !== 'INPUT') return;
  const type = (input.getAttribute('type') || input.type || 'text').toLowerCase();

  if (type === 'number') {
    const existingInputMode = input.getAttribute('inputmode');
    if (!existingInputMode) {
      const step = (input.getAttribute('step') || '').trim().toLowerCase();
      const pattern = (input.getAttribute('pattern') || '').trim();
      const hintText = [
        input.getAttribute('placeholder') || '',
        input.getAttribute('aria-label') || '',
        input.getAttribute('name') || '',
      ]
        .join(' ')
        .toLowerCase();

      const isExplicitInteger =
        input.dataset.integer === 'true' ||
        pattern === '[0-9]*' ||
        pattern === '\\d*' ||
        (step === '1' &&
          /(cuota|cantidad|cant|stock|unidad|dia|día|mes|año|pin|limite|límite|edad|orden|vigencia|max|min)/i.test(
            hintText
          ));

      if (isExplicitInteger) {
        input.setAttribute('inputmode', 'numeric');
        if (!pattern) input.setAttribute('pattern', '[0-9]*');
      } else {
        input.setAttribute('inputmode', 'decimal');
      }
    }
    if (!input.hasAttribute('enterkeyhint')) {
      input.setAttribute('enterkeyhint', 'done');
    }
  } else if (type === 'tel') {
    if (!input.hasAttribute('inputmode')) {
      input.setAttribute('inputmode', 'tel');
    }
    if (!input.hasAttribute('enterkeyhint')) {
      input.setAttribute('enterkeyhint', 'done');
    }
  } else if (type === 'search' || type === 'text') {
    if (!input.hasAttribute('enterkeyhint')) {
      const ph = (input.getAttribute('placeholder') || '').toLowerCase();
      if (
        type === 'search' ||
        ph.includes('buscar') ||
        ph.includes('escanea') ||
        ph.includes('search') ||
        ph.includes('filtrar')
      ) {
        input.setAttribute('enterkeyhint', 'search');
      } else {
        input.setAttribute('enterkeyhint', 'done');
      }
    }
  }
}

function scanAndEnhanceInputs(root: ParentNode): void {
  if (!root || typeof (root as Element).querySelectorAll !== 'function') return;
  const inputs = (root as Element).querySelectorAll('input');
  for (let i = 0; i < inputs.length; i++) {
    applyNumericKeyboardAttributes(inputs[i] as HTMLInputElement);
  }
}

export function subscribeMobileKeyboardState(cb: StateListener): () => void {
  listeners.add(cb);
  cb(currentState);
  return () => {
    listeners.delete(cb);
  };
}

export function installMobileKeyboardEnhancements(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (isInstalled) return () => {};
  isInstalled = true;

  baselineHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  scanAndEnhanceInputs(document);

  let lastKeydownTimestamp = 0;
  let autofillTimer: number | null = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let touchStartedInsideEditable = false;

  const scheduleAutofillDismiss = (targetEl: HTMLElement) => {
    if (!isTouchDevice()) return;
    if (autofillTimer !== null) window.clearTimeout(autofillTimer);
    autofillTimer = window.setTimeout(() => {
      autofillTimer = null;
      // Only dismiss if no recent manual typing happened and same field is still focused
      if (Date.now() - lastKeydownTimestamp < 220) return;
      if (document.activeElement === targetEl) {
        forceDismissMobileKeyboard();
      }
    }, 180);
  };

  const handleFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && target.tagName === 'INPUT') {
      applyNumericKeyboardAttributes(target as HTMLInputElement);
    }
    if (isEditableElement(target)) {
      lastFocusedEditable = target;
    }
    window.setTimeout(updateKeyboardState, 30);
  };

  const handleFocusOut = () => {
    window.setTimeout(() => {
      if (!isEditableElement(document.activeElement)) {
        lastFocusedEditable = null;
      }
      updateKeyboardState();
    }, 60);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    lastKeydownTimestamp = Date.now();
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement | null;
    if (!target || target.tagName !== 'INPUT') return;
    if (target.getAttribute('data-keep-keyboard') === 'true') return;

    const inp = target as HTMLInputElement;
    const inpType = (inp.type || 'text').toLowerCase();
    const isTouch = isTouchDevice();
    const ph = (inp.placeholder || '').toLowerCase();
    const isScannerInput =
      ph.includes('escanea') || ph.includes('barcode') || ph.includes('código de barras');

    // On desktop without touch keyboard, let continuous barcode scanners keep focus
    if (!isTouch && isScannerInput) return;

    // Wait briefly so React's own onKeyDown / form submit runs first;
    // if focus didn't advance to a different input, dismiss the soft keyboard.
    window.setTimeout(() => {
      const stillSameInput = document.activeElement === inp;
      const isClosedByViewport = !currentState.isOpen && !isTouch;
      if (stillSameInput && (!isClosedByViewport || inpType === 'number' || inpType === 'tel')) {
        forceDismissMobileKeyboard();
      }
    }, 70);
  };

  // Detect Android Chrome / Gboard autofill & datalist replacement ("relleno de datos")
  const handleInputEvent = (e: Event) => {
    const target = e.target as HTMLElement | null;
    if (!target || target.tagName !== 'INPUT') return;
    const inputEv = e as InputEvent;
    if (inputEv.inputType === 'insertReplacementText') {
      scheduleAutofillDismiss(target);
    }
  };

  const handleAnimationStart = (e: AnimationEvent) => {
    if (e.animationName !== 'gosenAutoFillDetect') return;
    const target = e.target as HTMLElement | null;
    if (target && target.tagName === 'INPUT') {
      scheduleAutofillDismiss(target);
    }
  };

  const handleSubmit = () => {
    if (!isTouchDevice()) return;
    window.setTimeout(() => {
      forceDismissMobileKeyboard();
    }, 50);
  };

  // Dismiss keyboard AFTER clicking buttons, chips, presets, tabs, selects, or links
  // (Delayed 45ms so React click handlers execute BEFORE `interactive-widget=resizes-content` shifts layout!)
  const handleClick = (e: MouseEvent) => {
    const activeBefore = isEditableElement(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : lastFocusedEditable;
    if (!activeBefore) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;

    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    if (target.closest('[data-keep-keyboard="true"]')) return;

    const clickedControl = target.closest(
      'button, a, select, [role="button"], [role="tab"], [role="menuitem"], [role="option"]'
    );
    const clickedLabel = target.closest('label') as HTMLLabelElement | null;
    const labelForAnotherNonText =
      clickedLabel &&
      clickedLabel.control &&
      clickedLabel.control !== activeBefore &&
      !isEditableElement(clickedLabel.control);

    if (!clickedControl && !labelForAnotherNonText) return;

    window.setTimeout(() => {
      const curr = document.activeElement;
      // Only dismiss if click handler didn't intentionally focus a DIFFERENT editable input
      if (!isEditableElement(curr) || curr === activeBefore) {
        forceDismissMobileKeyboard();
      }
    }, 45);
  };

  // Dismiss keyboard when tapping outside on empty non-interactive background or scrolling away
  const handleTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartTime = Date.now();
    const target = e.target as HTMLElement | null;
    touchStartedInsideEditable = Boolean(
      target && target.closest('input, textarea, [contenteditable="true"]')
    );
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (touchStartedInsideEditable) return;
    if (!isEditableElement(document.activeElement)) return;
    const t = e.touches[0];
    if (!t) return;
    const dy = Math.abs(t.clientY - touchStartY);
    if (dy > 44) {
      forceDismissMobileKeyboard();
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    const active = document.activeElement;
    if (!isEditableElement(active)) return;

    const t = e.changedTouches[0];
    if (!t) return;
    const dx = Math.abs(t.clientX - touchStartX);
    const dy = Math.abs(t.clientY - touchStartY);
    const dt = Date.now() - touchStartTime;

    // Must be a deliberate tap, not a scroll drag
    if (dx > 12 || dy > 12 || dt > 450) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Ignore taps on inputs, buttons (handled safely by click after 45ms), or labels for the active input
    if (
      target.closest(
        'input, textarea, select, option, button, a, [role="button"], [contenteditable="true"], [data-keep-keyboard="true"]'
      )
    ) {
      return;
    }

    const label = target.closest('label') as HTMLLabelElement | null;
    if (label && label.control === active) return;

    window.setTimeout(() => {
      if (document.activeElement === active) {
        forceDismissMobileKeyboard();
      }
    }, 30);
  };

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.tagName === 'INPUT') {
              applyNumericKeyboardAttributes(el as HTMLInputElement);
            } else {
              scanAndEnhanceInputs(el);
            }
          }
        });
      }
    }

    // CRITICAL Android WebView/Chrome fix: if React removed, hid, or disabled the focused
    // input (e.g. closing a modal on Save), Android often leaves the soft keyboard stuck!
    if (lastFocusedEditable && isTouchDevice()) {
      const detached = !lastFocusedEditable.isConnected;
      const disabledNow =
        (lastFocusedEditable as HTMLInputElement).disabled ||
        (lastFocusedEditable as HTMLInputElement).readOnly;
      const hiddenNow = !detached && !isElementVisible(lastFocusedEditable);
      if (detached || disabledNow || hiddenNow) {
        forceDismissMobileKeyboard();
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'readonly', 'hidden', 'style', 'class'],
    });
  }

  document.addEventListener('focusin', handleFocusIn, true);
  document.addEventListener('focusout', handleFocusOut, true);
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('input', handleInputEvent, true);
  document.addEventListener('animationstart', handleAnimationStart as EventListener, true);
  document.addEventListener('submit', handleSubmit, true);
  document.addEventListener('click', handleClick, false);
  document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
  document.addEventListener('touchmove', handleTouchMove, { passive: true, capture: true });
  document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });

  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', updateKeyboardState);
    vv.addEventListener('scroll', updateKeyboardState);
  }
  window.addEventListener('resize', updateKeyboardState);

  return () => {
    isInstalled = false;
    observer.disconnect();
    document.removeEventListener('focusin', handleFocusIn, true);
    document.removeEventListener('focusout', handleFocusOut, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('input', handleInputEvent, true);
    document.removeEventListener('animationstart', handleAnimationStart as EventListener, true);
    document.removeEventListener('submit', handleSubmit, true);
    document.removeEventListener('click', handleClick, false);
    document.removeEventListener('touchstart', handleTouchStart, true);
    document.removeEventListener('touchmove', handleTouchMove, true);
    document.removeEventListener('touchend', handleTouchEnd, true);
    if (vv) {
      vv.removeEventListener('resize', updateKeyboardState);
      vv.removeEventListener('scroll', updateKeyboardState);
    }
    window.removeEventListener('resize', updateKeyboardState);
  };
}
