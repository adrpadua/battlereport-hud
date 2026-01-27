import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractUnitLinksFromTOC } from './toc-parser.js';

describe('extractUnitLinksFromTOC', () => {
  // Suppress console.log during tests
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts unit names and slugs from datasheet links', () => {
    const html = `
      <html>
        <body>
          <a href="/wh40k10ed/factions/tyranids/datasheets#Hive-Tyrant">Hive Tyrant</a>
          <a href="/wh40k10ed/factions/tyranids/datasheets#Hormagaunts">Hormagaunts</a>
        </body>
      </html>
    `;

    const result = extractUnitLinksFromTOC(html);

    expect(result).toEqual([
      { name: 'Hive Tyrant', slug: 'Hive-Tyrant' },
      { name: 'Hormagaunts', slug: 'Hormagaunts' },
    ]);
  });

  it('preserves hyphenated names from HTML link text', () => {
    // This is the key bug fix - markdown would truncate "Caladius Grav-tank" to "Caladius Grav"
    const html = `
      <html>
        <body>
          <a href="/wh40k10ed/factions/adeptus-custodes/datasheets#Caladius-Grav-tank">Caladius Grav-tank</a>
          <a href="/wh40k10ed/factions/adeptus-custodes/datasheets#Shield-captain">Shield-captain</a>
          <a href="/wh40k10ed/factions/adeptus-custodes/datasheets#Knight-centura">Knight-centura</a>
        </body>
      </html>
    `;

    const result = extractUnitLinksFromTOC(html);

    expect(result).toEqual([
      { name: 'Caladius Grav-tank', slug: 'Caladius-Grav-tank' },
      { name: 'Shield-captain', slug: 'Shield-captain' },
      { name: 'Knight-centura', slug: 'Knight-centura' },
    ]);
  });

  it('skips Legends units marked with preceding image', () => {
    const html = `
      <html>
        <body>
          <a href="/wh40k10ed/factions/tyranids/datasheets#Hive-Tyrant">Hive Tyrant</a>
          <img src="/images/Legends_logo.png"><a href="/wh40k10ed/factions/tyranids/datasheets#Malanthrope">Malanthrope</a>
          <a href="/wh40k10ed/factions/tyranids/datasheets#Hormagaunts">Hormagaunts</a>
        </body>
      </html>
    `;

    const result = extractUnitLinksFromTOC(html);

    expect(result).toEqual([
      { name: 'Hive Tyrant', slug: 'Hive-Tyrant' },
      { name: 'Hormagaunts', slug: 'Hormagaunts' },
    ]);
    expect(console.log).toHaveBeenCalledWith('  [Skip] Malanthrope (Legends)');
  });

  it('skips Forge World units marked with FW logo', () => {
    const html = `
      <html>
        <body>
          <a href="/wh40k10ed/factions/tyranids/datasheets#Hive-Tyrant">Hive Tyrant</a>
          <img src="/images/FW_logo.png"><a href="/wh40k10ed/factions/tyranids/datasheets#Harridan">Harridan</a>
        </body>
      </html>
    `;

    const result = extractUnitLinksFromTOC(html);

    expect(result).toEqual([
      { name: 'Hive Tyrant', slug: 'Hive-Tyrant' },
    ]);
    expect(console.log).toHaveBeenCalledWith('  [Skip] Harridan (FW)');
  });

  it('skips Legends units when logo is on parent previous sibling', () => {
    // Structure: <img><span><a>Unit</a></span>
    // The link is wrapped, but the logo is a sibling of the wrapper
    const html = `
      <html>
        <body>
          <img src="/images/Legends_logo.png">
          <span>
            <a href="/wh40k10ed/factions/tyranids/datasheets#Malanthrope">Malanthrope</a>
          </span>
        </body>
      </html>
    `;

    const result = extractUnitLinksFromTOC(html);

    expect(result).toEqual([]);
    expect(console.log).toHaveBeenCalledWith('  [Skip] Malanthrope (Legends)');
  });

  it('deduplicates units with same anchor slug', () => {
    const html = `
      <html>
        <body>
          <a href="/wh40k10ed/factions/tyranids/datasheets#Hive-Tyrant">Hive Tyrant</a>
          <a href="/wh40k10ed/factions/tyranids/datasheets#Hive-Tyrant">Hive Tyrant (duplicate)</a>
        </body>
      </html>
    `;

    const result = extractUnitLinksFromTOC(html);

    expect(result).toEqual([
      { name: 'Hive Tyrant', slug: 'Hive-Tyrant' },
    ]);
  });

  it('handles URL-encoded anchor slugs', () => {
    const html = `
      <html>
        <body>
          <a href="/wh40k10ed/factions/tyranids/datasheets#Tyranid%20Warriors">Tyranid Warriors</a>
        </body>
      </html>
    `;

    const result = extractUnitLinksFromTOC(html);

    expect(result).toEqual([
      { name: 'Tyranid Warriors', slug: 'Tyranid-Warriors' },
    ]);
  });

  it('ignores links without datasheet anchors', () => {
    const html = `
      <html>
        <body>
          <a href="/wh40k10ed/factions/tyranids">Tyranids Faction</a>
          <a href="/wh40k10ed/factions/tyranids/datasheets#Hive-Tyrant">Hive Tyrant</a>
          <a href="https://example.com">External Link</a>
        </body>
      </html>
    `;

    const result = extractUnitLinksFromTOC(html);

    expect(result).toEqual([
      { name: 'Hive Tyrant', slug: 'Hive-Tyrant' },
    ]);
  });

  it('handles empty HTML gracefully', () => {
    const result = extractUnitLinksFromTOC('');
    expect(result).toEqual([]);
  });

  it('handles HTML with no matching links', () => {
    const html = `
      <html>
        <body>
          <a href="/other/page">Some Link</a>
          <p>No datasheet links here</p>
        </body>
      </html>
    `;

    const result = extractUnitLinksFromTOC(html);
    expect(result).toEqual([]);
  });

  it('skips links with empty text', () => {
    const html = `
      <html>
        <body>
          <a href="/wh40k10ed/factions/tyranids/datasheets#Empty"></a>
          <a href="/wh40k10ed/factions/tyranids/datasheets#Hive-Tyrant">Hive Tyrant</a>
        </body>
      </html>
    `;

    const result = extractUnitLinksFromTOC(html);

    expect(result).toEqual([
      { name: 'Hive Tyrant', slug: 'Hive-Tyrant' },
    ]);
  });
});
