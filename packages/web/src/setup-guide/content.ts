/**
 * First-time setup guide content (issue #181) — the single source of truth for
 * both the web guide page (setup-guide.html via page.ts) and the generated PDF
 * (scripts/gen-setup-guide-pdf.ts). Edit copy HERE, never in the renderers.
 *
 * Every claim mirrors shipped behavior:
 *   - setup screen text/steps: scripts/gen-reset-screen.ts
 *   - captive portal + reset combo: firmware/integrated/integrated.ino
 *   - pairing flow: packages/web/src/pair.ts + packages/api/src/pair.ts
 */

/** An image shown alongside a step. `src` is relative to the web root. */
export interface GuideImage {
  src: string;
  alt: string;
  caption: string;
}

/** Where the user should look for the described result. */
export type ExpectationPlace = 'device' | 'phone' | 'website';

/** "What you'll see" — one observable result of a step. */
export interface GuideExpectation {
  place: ExpectationPlace;
  text: string;
  image?: GuideImage;
}

export interface GuideStep {
  id: string;
  title: string;
  /** Instruction paragraphs — what the user should do. */
  body: string[];
  /** What the user should expect to see, per surface. */
  expectations: GuideExpectation[];
  /** Optional expectation-setting or troubleshooting note. */
  tip?: string;
}

export const GUIDE_TITLE = 'Setting up your InfoBento';

export const GUIDE_INTRO =
  'Setup takes about five minutes: connect the device to your Wi-Fi, claim it on ' +
  'www.infobento.com, and design what it shows. Each step below tells you what to do ' +
  'and what you should expect to see on the device, on your phone, and on the website.';

export const PLACE_LABELS: Record<ExpectationPlace, string> = {
  device: 'On the device',
  phone: 'On your phone',
  website: 'On the website',
};

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    id: 'power-on',
    title: 'Unbox and power on',
    body: [
      'Place your InfoBento where you want it and fold out the kickstand.',
      'Out of the box (or after a reset) the display shows the setup screen. eInk keeps ' +
        'its image without power, so it may already be visible when you open the box.',
    ],
    expectations: [
      {
        place: 'device',
        text:
          'The "Set up InfoBento" screen: three numbered steps and a QR code that links to ' +
          'www.infobento.com. Press the green button if you want to flip it between ' +
          'landscape and portrait.',
        image: {
          src: '/setup-guide/device-setup-screen.png',
          alt: 'InfoBento setup screen with three numbered steps and a help QR code',
          caption: 'The setup screen your device shows before it is configured.',
        },
      },
    ],
  },
  {
    id: 'join-network',
    title: "Join the device's Wi-Fi network",
    body: [
      'On your phone, open Wi-Fi settings and join the network named InfoBento-XXXX ' +
        '(the last four characters are unique to your device). It has no password.',
    ],
    expectations: [
      {
        place: 'phone',
        text: 'A few seconds after joining, the InfoBento setup page opens by itself.',
      },
    ],
    tip:
      'If nothing opens automatically, open a browser and go to http://192.168.4.1 ' +
      'while still connected to the InfoBento-XXXX network.',
  },
  {
    id: 'enter-wifi',
    title: 'Enter your home Wi-Fi and the Device ID',
    body: [
      'Fill in your home Wi-Fi network name and password, and the Device ID from the ' +
        'sticker. Leave the Server field blank — it is only for self-hosted setups.',
      'Press Connect.',
    ],
    expectations: [
      {
        place: 'phone',
        text:
          'A plain black-and-white form with fields for Wi-Fi network, password, Device ID, ' +
          'and an optional server. If something is wrong (for example an empty Device ID), ' +
          'the page reloads with a message telling you what to fix.',
        image: {
          src: '/setup-guide/captive-portal.png',
          alt: 'InfoBento captive setup page with Wi-Fi network, password, and Device ID fields',
          caption: 'The setup page that opens on your phone.',
        },
      },
      {
        place: 'device',
        text:
          'After Connect succeeds, the device joins your Wi-Fi, restarts, and fetches its ' +
          'first display. Give it a minute or two — the screen will flash a few times while ' +
          'the eInk panel redraws.',
      },
    ],
  },
  {
    id: 'claim-device',
    title: 'Claim your device at www.infobento.com',
    body: [
      'Scan the QR code on the pairing sticker with your phone camera, or go to ' +
        'www.infobento.com and enter the pair code printed under the QR.',
      'Sign in when asked, then press "Claim this device".',
    ],
    expectations: [
      {
        place: 'website',
        text:
          'The pairing page shows your pair code and a "Claim this device" button. If you ' +
          'are not signed in yet, it offers sign-in first — no separate account creation step.',
        image: {
          src: '/setup-guide/pair-page.png',
          alt: 'InfoBento device pairing page with a pair code field and Claim this device button',
          caption: 'The pairing page, reached from the sticker QR code.',
        },
      },
      {
        place: 'website',
        text: 'After claiming, the device is attached to your account and listed under Devices.',
        image: {
          src: '/setup-guide/sticker.png',
          alt: 'Sample InfoBento pairing sticker with QR code and printed pair code',
          caption: 'The pairing sticker: scan the QR code, or type the code printed beneath it.',
        },
      },
    ],
    tip:
      'If you see "This device is already paired to a different account", sign in with ' +
      'the account that claimed it first, or reset the device to start over.',
  },
  {
    id: 'design',
    title: 'Design your bento',
    body: [
      'Open www.infobento.com to arrange what your display shows: add boxes (weather, ' +
        'countdowns, quotes, and more), tweak font size and spacing, and preview exactly ' +
        'what the panel will render.',
    ],
    expectations: [
      {
        place: 'website',
        text:
          'The editor, with a live eInk preview on the left and your box list on the right. ' +
          'On your first visit a short consent notice appears before you can edit.',
        image: {
          src: '/setup-guide/editor.png',
          alt: 'InfoBento web editor with eInk preview, box list, and add-box chips',
          caption: 'The editor at www.infobento.com.',
        },
      },
      {
        place: 'device',
        text:
          'The panel updates on its refresh schedule, not instantly. On battery and solar ' +
          'the default is one or two refreshes per day, so your changes appear at the next ' +
          'scheduled refresh.',
      },
    ],
    tip:
      'eInk is designed to be glanceable and always-on, not live like a phone screen. ' +
      'Infrequent refreshes are what let the battery and solar panel run it indefinitely.',
  },
  {
    id: 'reset',
    title: 'Starting over (reset)',
    body: [
      'If the device cannot reach your Wi-Fi, or you move it to a new network, reset it: ' +
        'hold both white buttons for five seconds.',
      'Then repeat this guide from step 2.',
    ],
    expectations: [
      {
        place: 'device',
        text:
          'The setup screen returns, with a note confirming that all saved Wi-Fi, settings, ' +
          'and usage data were erased from the device.',
      },
    ],
  },
];
