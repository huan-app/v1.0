const diagrams = Array.from(document.querySelectorAll('[data-devlab-diagram]'), (figure) => ({
  figure,
  stage: figure.querySelector('[data-devlab-diagram-stage]'),
  fallback: figure.querySelector('[data-devlab-diagram-fallback]'),
  source: figure.querySelector('[data-devlab-diagram-source]'),
}));

function sanitizeSvg(svgMarkup) {
  const parser = new DOMParser();
  const svgDocument = parser.parseFromString(svgMarkup, 'image/svg+xml');

  if (svgDocument.querySelector('parsererror')) {
    throw new Error('The diagram renderer returned invalid SVG.');
  }

  svgDocument.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((element) => {
    element.remove();
  });

  svgDocument.querySelectorAll('style').forEach((style) => {
    style.textContent = style.textContent.replace(
      /@import\s+(?:url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)|"[^"]*"|'[^']*')[^;]*;/gi,
      '',
    );
  });

  svgDocument.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (/^on/i.test(attribute.name)) {
        element.removeAttribute(attribute.name);
        return;
      }

      if ((attribute.name === 'href' || attribute.name === 'xlink:href') && !attribute.value.startsWith('#')) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  const svg = svgDocument.documentElement;
  svg.classList.add('diagram-svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.removeAttribute('width');
  svg.removeAttribute('height');

  return document.importNode(svg, true);
}

function showError({ figure, stage, fallback }) {
  stage.setAttribute('role', 'region');
  stage.removeAttribute('aria-busy');
  fallback.hidden = false;
  figure.dataset.diagramState = 'error';
}

function renderDiagram(diagram, renderMermaidSVG) {
  const { figure, stage, source } = diagram;

  try {
    if (!source.textContent) {
      throw new Error('The diagram source is empty.');
    }

    const svgMarkup = renderMermaidSVG(source.textContent, {
      bg: 'var(--diagram-bg)',
      fg: 'var(--diagram-fg)',
      line: 'var(--diagram-line)',
      accent: 'var(--diagram-accent)',
      muted: 'var(--diagram-muted)',
      surface: 'var(--diagram-surface)',
      border: 'var(--diagram-border)',
      font: 'system-ui',
      transparent: true,
      padding: 28,
      nodeSpacing: 30,
      layerSpacing: 46,
      componentSpacing: 30,
    });

    stage.replaceChildren(sanitizeSvg(svgMarkup));
    stage.removeAttribute('aria-busy');
    figure.dataset.diagramState = 'ready';
  } catch (_) {
    showError(diagram);
  }
}

if (diagrams.length) {
  for (const { figure, stage, fallback } of diagrams) {
    fallback.hidden = true;
    stage.setAttribute('role', 'img');
    stage.setAttribute('aria-busy', 'true');
    figure.dataset.diagramState = 'loading';
  }

  import('../vendor/beautiful-mermaid/beautiful-mermaid.min.js')
    .then(({ renderMermaidSVG }) => {
      diagrams.forEach((diagram) => renderDiagram(diagram, renderMermaidSVG));
    })
    .catch(() => {
      diagrams.forEach(showError);
    });
}
