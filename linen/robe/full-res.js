(() => {
  const sourceCommit = 'fcaf91c172008aa1be74e66b9c3087ceaf2438a9';
  const sourceBase = `https://raw.githubusercontent.com/tmsteph/3dvr-portal/${sourceCommit}/linen/robe/.parts/`;

  const images = [
    { selector: 'img[src$="work-robe.svg"]', prefix: 'work', parts: 6 },
    { selector: 'img[src$="jedi-study.svg"]', prefix: 'jedi', parts: 4 },
    { selector: 'img[src$="short-wrap.svg"]', prefix: 'short', parts: 4 },
  ];

  async function loadFullResolution({ selector, prefix, parts }) {
    const image = document.querySelector(selector);
    if (!image) return;

    try {
      const chunks = await Promise.all(
        Array.from({ length: parts }, async (_, index) => {
          const part = String(index).padStart(2, '0');
          const response = await fetch(`${sourceBase}${prefix}.${part}.b64`, { cache: 'force-cache' });
          if (!response.ok) throw new Error(`Unable to load ${prefix}.${part}`);
          return (await response.text()).replace(/\s+/g, '');
        }),
      );

      image.src = `data:image/webp;base64,${chunks.join('')}`;
      image.dataset.resolution = 'full';
    } catch (error) {
      console.warn('Keeping lightweight robe preview:', error);
    }
  }

  images.forEach(loadFullResolution);
})();
