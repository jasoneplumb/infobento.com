/**
 * Header-menu "Devices" panel (issue #76). Lists the signed-in account's paired
 * devices and lets the user switch the active device (the editor then reads/
 * writes that device's config server-side) or unpair one. Pairing itself happens
 * via the device's QR deep link (/pair/:code, issue #74); this panel manages the
 * devices already claimed.
 */

import { listDevices, selectDevice, unpairDevice, type DeviceSummary } from '../cloud';
import { getActiveDeviceId } from '../state';
import { makeDialog } from './dialog';

/** Build a single device row with Use / Unpair actions. */
function deviceRow(
  device: DeviceSummary,
  onChanged: () => void,
  close: () => void,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'device-row';

  const label = document.createElement('span');
  label.className = 'device-code';
  label.textContent = device.pairCode;
  row.appendChild(label);

  if (getActiveDeviceId() === device.id) {
    const badge = document.createElement('span');
    badge.className = 'device-active-badge';
    badge.textContent = 'Active';
    row.appendChild(badge);
  } else {
    const use = document.createElement('button');
    use.type = 'button';
    use.className = 'btn-secondary device-use';
    use.textContent = 'Use';
    use.addEventListener('click', () => {
      use.disabled = true;
      void selectDevice(device.id).then((ok) => {
        if (ok) close();
        else {
          use.disabled = false;
          use.textContent = 'Retry';
        }
      });
    });
    row.appendChild(use);
  }

  const unpair = document.createElement('button');
  unpair.type = 'button';
  unpair.className = 'btn-secondary device-unpair';
  unpair.textContent = 'Unpair';
  unpair.addEventListener('click', () => {
    unpair.disabled = true;
    void unpairDevice(device.id).then((ok) => {
      if (ok) onChanged();
      else {
        unpair.disabled = false;
        unpair.textContent = 'Retry';
      }
    });
  });
  row.appendChild(unpair);

  return row;
}

/** Open the devices panel. */
export function openDevicesDialog(): void {
  const { overlay, card, close } = makeDialog();
  card.innerHTML = '<h2>Devices</h2><p class="device-message">Loading…</p>';
  document.body.appendChild(overlay);

  const render = (): void => {
    void listDevices().then((devices) => {
      card.innerHTML = '<h2>Devices</h2>';
      if (devices.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'device-message';
        empty.textContent =
          'No paired devices yet. Scan the QR code on your InfoBento to pair it to this account.';
        card.appendChild(empty);
      } else {
        const list = document.createElement('div');
        list.className = 'device-list';
        for (const d of devices) list.appendChild(deviceRow(d, render, close));
        card.appendChild(list);
      }
      const actions = document.createElement('div');
      actions.className = 'consent-actions';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'btn-primary';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', close);
      actions.appendChild(closeBtn);
      card.appendChild(actions);
    });
  };

  render();
}
