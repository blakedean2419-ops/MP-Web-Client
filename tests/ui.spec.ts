import { test, expect, type Page } from "@playwright/test";

async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}

test("responsive live dashboard, tag search, trend selection, history and CSV export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Process overview." }),
  ).toBeVisible();
  await expect(
    page.getByText("Numeric Control [0]", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator(".demo-banner")).toBeVisible();
  await expect(page.locator(".tag-table-panel tbody tr")).toHaveCount(6);
  await expect(page.locator(".recharts-area-curve")).toBeVisible();
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport);
  await page
    .getByRole("textbox", { name: "Search tags" })
    .fill("Numeric Control [99]");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "View trend for Numeric Control [99]" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Process trends." }),
  ).toBeVisible();
  await expect(page.getByLabel("Chart tag")).toHaveValue("Array[99]");
  await page.getByRole("button", { name: "15 min", exact: true }).click();
  await expect(page.locator(".recharts-area-curve")).toBeVisible();
  await navigate(page, "History");
  await expect(
    page.getByRole("heading", { name: "Historical data." }),
  ).toBeVisible();
  await expect(page.locator(".history-table tbody tr").first()).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/mp-history-.*\.csv$/);
  const stream = await download.createReadStream();
  let content = "";
  for await (const chunk of stream!) content += chunk.toString();
  expect(content).toContain("timestamp,tag,name,value,unit");
  expect(content).toContain("Array[99]");
  expect(errors).toEqual([]);
});

test("device HMI preferences persist, can reset, and the connection guide works", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Numeric Control [0]", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Customize view", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("checkbox", { name: "Numeric Control [0] Array[0]" })
    .uncheck();
  await dialog
    .getByRole("combobox", { name: "Display type for Numeric Control [1]" })
    .selectOption("value");
  await dialog.getByRole("button", { name: "Save device view" }).click();
  await expect(page.locator(".hmi-widget")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".hmi-widget")).toHaveCount(2);
  await expect(
    page.locator(".hmi-widget").first().locator(".gauge-track"),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Customize view", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Reset defaults" }).click();
  await expect(page.locator(".hmi-widget")).toHaveCount(3);
  await page.getByRole("button", { name: "Connect service" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Connect your process." }),
  ).toBeVisible();
  await expect(
    dialog.getByText("XML_SERVICE_URL", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Got it" }).click();
  await expect(dialog).toHaveCount(0);
});
