import { expect, type Page } from '@playwright/test';
import { islandsInRegion } from '../src/content/world';
import { catalogLessons } from '../src/content/world/catalog';
import { ON, openRegion, test } from './world-helpers';

/*
 * P9 S1: island interaction targets as typed, validated routes. The home map is unchanged (S0 decision 6): its
 * foundations workshop still leads to /learn. On a region map (a build made with LOGIC_ISLAND_REGIONAL_WORLD=1) the
 * workshop leads to the island's own syllabus (S0 decision 4), and a planned island offers no course entry at all.
 */
const places = (page: Page, island: string) => page.getByRole('region', { name: `${island}地點` });
const poi = (page: Page, island: string, node: string) => places(page, island).locator(`button[data-target="${node}"]`);

test('every published island\'s syllabus anchor exists on /curriculum and lands on its heading', async ({ page }) => {
  const published = (['cs', 'ai', 'design', 'web', 'sys'] as const).flatMap(r => islandsInRegion(r)).filter(i => i.status !== 'planned');
  // programming-languages: PL01–PL05 published in course production batch 1.
  // CN-1 (2026-11-22): the computer-networks island opened with CN01–CN05; AIF-1 opened the AI foundations island; LNX-1 the Linux systems island.
  // SRV-1 opened the network and servers island; LLM-1 the large-language-models island, GEN-1 the generative-ai island and WEB-1 the web foundations island (in region order: ai, web, sys).
  // DKR-1 opened the Docker containers island, between the Linux systems and network servers islands (the world's order).
  expect(published.map(i => i.id)).toEqual(['foundations', 'structures', 'algorithms', 'programming-languages', 'databases', 'networks', 'ai-foundations', 'large-language-models', 'generative-ai', 'web-foundations', 'linux-systems', 'docker-containers', 'network-servers']);
  for (const island of published) {
    await page.goto(`/curriculum#island-${island.id}`);
    const heading = page.locator(`#island-${island.id}`);
    await expect(heading).toContainText(island.name);
    await expect(heading).toBeInViewport();
    // The syllabus under the anchor lists the island's published lessons.
    const first = catalogLessons.find(l => l.islandId === island.id && l.lessonStatus === 'complete')!;
    await expect(page.locator(`main a[href="/curriculum/${first.slug}"]`).first()).toBeAttached();
  }
});

/**
 * P9.8a: a build made with LOGIC_ISLAND_P9_PROTOTYPE=1 has the P9 world overview at /, not the home map, so the home
 * map's own test runs only where / is the home map; the P9 test below checks the same workshop on the P9 region page.
 */
const P9 = process.env.LOGIC_ISLAND_P9_PROTOTYPE === '1';

test('home map (unchanged): the foundations workshop is named 學習路線 and leads to /learn', async ({ page }) => {
  test.skip(P9, 'with LOGIC_ISLAND_P9_PROTOTYPE=1, / is the P9 world overview (no home map)');
  await page.goto('/?island=foundations');
  const workshop = poi(page, '基礎程式島', 'Building_Workshop');
  await expect(workshop).toBeVisible({ timeout: 30_000 });
  await expect(workshop).toHaveText(/工坊\s*學習路線/);
  await expect(workshop).toHaveAttribute('data-route', 'labs');
  await expect(places(page, '基礎程式島').locator('button[data-target]')).toHaveCount(3);
  await workshop.click();
  await expect(page).toHaveURL(/\/learn$/);
});

test('P9 build: the CS region page\'s foundations workshop leads to the island\'s own syllabus', async ({ page }) => {
  test.skip(!P9, 'needs a build with LOGIC_ISLAND_P9_PROTOTYPE=1');
  await page.goto('/?island=foundations');
  // The P9 world overview has no island to focus; the island lives on its region page.
  await expect(places(page, '基礎程式島')).toHaveCount(0);
  await page.goto('/cs?island=foundations');
  const workshop = poi(page, '基礎程式島', 'Building_Workshop');
  await expect(workshop).toBeVisible({ timeout: 30_000 });
  await expect(workshop).toHaveText(/工坊\s*課綱/);
  await expect(workshop).toHaveAttribute('data-route', 'syllabus');
  await workshop.click();
  await expect(page).toHaveURL(/\/curriculum#island-foundations$/);
});

test.describe('region map (flag on)', () => {
  test.skip(!ON, 'built without LOGIC_ISLAND_REGIONAL_WORLD=1');

  test('the foundations workshop leads to the island\'s own syllabus; lighthouse and dock give information', async ({ page }) => {
    await openRegion(page, '/world/cs?island=foundations');
    const workshop = poi(page, '基礎程式島', 'Building_Workshop');
    await expect(workshop).toHaveText(/工坊\s*課綱/);
    await expect(workshop).toHaveAttribute('data-route', 'syllabus');
    for (const [node, text] of [['Landmark_Lighthouse', '基礎程式島的地標'], ['Dock_Entry', '群島的入口']] as const) {
      const button = poi(page, '基礎程式島', node);
      await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(places(page, '基礎程式島').getByRole('status')).toContainText(text);
    }
    // Keyboard: the workshop button takes the focus and Enter follows the route.
    await workshop.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/curriculum#island-foundations$/);
    const heading = page.locator('#island-foundations');
    await expect(heading).toContainText('基礎程式島');
    await expect(heading).toBeInViewport();
    // Nothing on the region map sends the foundations island's course entry to /learn any more.
    await page.goBack();
    await expect(places(page, '基礎程式島').locator('button[data-route="labs"]')).toHaveCount(0);
  });

  test('a planned island has no place list and no course entry, in any region', async ({ page }) => {
    // DKR-1 opened docker-containers, so the systems region's example is cloud-infrastructure (still planned).
    for (const [region, island] of [['cs', 'systems-analysis'], ['ai', 'machine-learning'], ['design', 'ui-design'], ['web', 'frontend'], ['sys', 'cloud-infrastructure']] as const) {
      await openRegion(page, `/world/${region}?island=${island}`);
      await expect(page.getByRole('region', { name: /地點$/ })).toHaveCount(0);
      await expect(page.locator('button[data-route]')).toHaveCount(0);
      await expect(page.locator('main a[href^="/curriculum/"]')).toHaveCount(0);
      await expect(page.locator('main a[href^="/curriculum#"]')).toHaveCount(0);
    }
  });
});
