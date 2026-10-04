export async function openPanel(page, name) {
  if (!(await page.locator(`#${name}-panel`).isVisible()))
    await page.locator(`[data-open-panel="${name}"]`).first().click();
}

export async function closePanel(page, name) {
  if (await page.locator(`#${name}-panel`).isVisible()) {
    await page.locator(`#${name}-panel [data-close-panel]`).first().click();
    await page.waitForFunction((name) => !document.querySelector(`#${name}-panel`).open, name);
  }
}

export async function chooseStage(page, type) {
  await openPanel(page, 'compose');
  await page.locator(`[data-shape="${type}"]`).click();
  await page.waitForFunction(
    (type) =>
      window.crystalLab.snapshot().stage.type === type && !document.querySelector('#compose-panel').open,
    type,
  );
}

export async function openView(page) {
  if (!(await page.locator('#view-panel').evaluate((element) => element.open)))
    await page.locator('#view-panel > summary').click();
}

export async function closeView(page) {
  if (await page.locator('#view-panel').evaluate((element) => element.open))
    await page.locator('#view-panel > summary').click();
}
