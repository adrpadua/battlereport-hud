import * as cheerio from 'cheerio';

export interface UnitLink {
  name: string;
  slug: string;
}

/**
 * Extract unit links from the datasheets TOC HTML
 * Uses Cheerio to parse HTML directly, avoiding Firecrawl's markdown conversion
 * which truncates hyphenated names (e.g., "Caladius Grav-tank" becomes "Caladius Grav")
 * Skips Legends and Forge World units (marked with logo images in TOC)
 */
export function extractUnitLinksFromTOC(html: string): UnitLink[] {
  const $ = cheerio.load(html);
  const units: UnitLink[] = [];
  const seen = new Set<string>();

  // Find all links to datasheets with anchors
  $('a[href*="/datasheets#"]').each((_, element) => {
    const $link = $(element);
    const href = $link.attr('href') || '';

    // Extract the anchor slug from the href
    const anchorMatch = href.match(/\/datasheets#(.+)$/);
    if (!anchorMatch?.[1]) return;

    const anchorSlug = decodeURIComponent(anchorMatch[1]).trim();
    if (!anchorSlug || seen.has(anchorSlug)) return;

    // Check for Legends or Forge World markers (preceding img with logo)
    // The TOC structure typically has: <img src="...Legends_logo..."> <a>Unit Name</a>
    const prevImg = $link.prev('img');
    const prevImgSrc = prevImg.attr('src') || '';

    // Also check parent's previous sibling for the logo
    const parentPrevImg = $link.parent().prev('img');
    const parentPrevImgSrc = parentPrevImg.attr('src') || '';

    const isLegends = prevImgSrc.includes('Legends_logo') || parentPrevImgSrc.includes('Legends_logo');
    const isForgeWorld = prevImgSrc.includes('FW_logo') || parentPrevImgSrc.includes('FW_logo');

    if (isLegends || isForgeWorld) {
      const name = $link.text().trim();
      console.log(`  [Skip] ${name} (${isLegends ? 'Legends' : 'FW'})`);
      return;
    }

    seen.add(anchorSlug);

    // Get the unit name from the link text (HTML preserves full name)
    const name = $link.text().trim();
    if (!name) return;

    // Keep original casing from anchor (wahapedia requires capitalized slugs)
    const slug = anchorSlug.replace(/\s+/g, '-');

    units.push({ name, slug });
  });

  return units;
}
