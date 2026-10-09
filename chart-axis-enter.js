'use strict';

// Delegate so dynamically created axis controls also support Enter.
document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229 || event.repeat || event.defaultPrevented) return;
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== 'number' || input.disabled) return;
  const controls = input.closest('.chart-axis-control, .measured-axes');
  if (!controls) return;
  const button = Array.from(controls.querySelectorAll('button')).find(item => item.textContent.trim() === '縦軸反映');
  if (!button || button.disabled) return;
  event.preventDefault();
  button.click();
});
