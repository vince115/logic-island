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
  expect(published.map(i => i.id)).toEqual(['foundations', 'structures', 'algorithms', 'databases']);
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

test('home map (unchanged): the foundations workshop is named 學習路線 and leads to /learn', async ({ page }) => {
  await page.goto('/?island=foundations');
  const workshop = poi(page, '基礎程式島', 'Building_Workshop');
  await expect(workshop).toBeVisible({ timeout: 30_000 });
  await expect(workshop).toHaveText(/工坊\s*學習路線/);
  await expect(workshop).toHaveAttribute('data-route', 'labs');
  await expect(places(page, '基礎程式島').locator('button[data-target]')).toHaveCount(3);
  await workshop.click();
  await expect(page).toHaveURL(/\/learn$/);
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
    for (const [region, island] of [['cs', 'networks'], ['ai', 'ai-foundations'], ['design', 'ui-design'], ['web', 'frontend'], ['sys', 'linux-systems']] as const) {
      await openRegion(page, `/world/${region}?island=${island}`);
      await expect(page.getByRole('region', { name: /地點$/ })).toHaveCount(0);
      await expect(page.locator('button[data-route]')).toHaveCount(0);
      await expect(page.locator('main a[href^="/curriculum/"]')).toHaveCount(0);
      await expect(page.locator('main a[href^="/curriculum#"]')).toHaveCount(0);
    }
  });
});
