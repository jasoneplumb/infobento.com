/**
 * Renders the first-time setup guide (setup-guide.html) from content.ts.
 * Static, no sign-in required. The same content drives the PDF
 * (scripts/gen-setup-guide-pdf.ts) — keep this file presentation-only.
 */

import {
  GUIDE_TITLE,
  GUIDE_INTRO,
  GUIDE_STEPS,
  PLACE_LABELS,
  type GuideExpectation,
  type GuideStep,
} from './content';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderExpectation(exp: GuideExpectation): HTMLElement {
  const wrap = el('div', 'guide-expectation');
  const label = el('span', `guide-place guide-place-${exp.place}`, PLACE_LABELS[exp.place]);
  const text = el('p', 'guide-expectation-text', exp.text);
  wrap.append(label, text);
  if (exp.image) {
    const figure = el('figure', 'guide-figure');
    const img = el('img');
    img.src = exp.image.src;
    img.alt = exp.image.alt;
    img.loading = 'lazy';
    const caption = el('figcaption', undefined, exp.image.caption);
    figure.append(img, caption);
    wrap.appendChild(figure);
  }
  return wrap;
}

function renderStep(step: GuideStep, index: number): HTMLElement {
  const section = el('section', 'guide-step');
  section.id = step.id;

  const heading = el('h2');
  heading.append(
    el('span', 'guide-step-number', String(index + 1)),
    document.createTextNode(step.title),
  );
  section.appendChild(heading);

  for (const paragraph of step.body) section.appendChild(el('p', 'guide-body', paragraph));
  for (const exp of step.expectations) section.appendChild(renderExpectation(exp));
  if (step.tip !== undefined) {
    const tip = el('p', 'guide-tip');
    tip.append(el('strong', undefined, 'Tip: '), document.createTextNode(step.tip));
    section.appendChild(tip);
  }
  return section;
}

export function renderGuide(root: HTMLElement): void {
  const article = el('article', 'guide');

  const header = el('header', 'guide-header');
  header.append(el('h1', undefined, GUIDE_TITLE), el('p', 'guide-intro', GUIDE_INTRO));

  const toc = el('nav', 'guide-toc');
  const tocList = el('ol');
  GUIDE_STEPS.forEach((step) => {
    const item = el('li');
    const link = el('a', undefined, step.title);
    link.href = `#${step.id}`;
    item.appendChild(link);
    tocList.appendChild(item);
  });
  toc.appendChild(tocList);
  header.appendChild(toc);

  const pdfLink = el('p', 'guide-pdf-link');
  const a = el('a', undefined, 'Download this guide as a PDF');
  a.href = '/setup-guide.pdf';
  pdfLink.appendChild(a);
  header.appendChild(pdfLink);

  article.appendChild(header);
  GUIDE_STEPS.forEach((step, i) => article.appendChild(renderStep(step, i)));

  const footer = el('footer', 'guide-footer');
  const home = el('a', undefined, 'www.infobento.com');
  home.href = '/';
  footer.append(home, el('span', 'guide-version', `InfoBento v${__APP_VERSION__}`));
  article.appendChild(footer);

  root.appendChild(article);
}

const root = document.getElementById('guide-root');
if (root) renderGuide(root);
