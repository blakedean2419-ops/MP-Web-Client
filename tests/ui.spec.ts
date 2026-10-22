import { test, expect } from "@playwright/test";

test("dark dashboard supports multiple traces and persistent group editing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByLabel("Dashboard title")).toHaveValue("Fuel and Air");
  await expect(page.locator(".trace-chip")).toHaveCount(4);
  await expect(page.locator(".connection")).toContainText(
    "Demo · simulated data",
  );
  await expect(page.locator(".recharts-line")).toHaveCount(4);
  await page.getByLabel("Dashboard title").fill("Combustion monitor");
  await page.getByLabel("Graph title").fill("Temperatures and pressure");
  await page
    .getByRole("button", { name: "Configure Traces", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Search tags").fill("Array[4]");
  await dialog.getByLabel("Include Array[4]", { exact: true }).check();
  await dialog.getByLabel("Color Array[4]", { exact: true }).fill("#ff8800");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".trace-chip")).toHaveCount(5);
  await expect(page.locator(".recharts-line")).toHaveCount(5);
  await page.getByLabel("Show Array[4]", { exact: true }).uncheck();
  await expect(page.locator(".recharts-line")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Edit Fuel and Air", exact: true })
    .click();
  await dialog.getByLabel("Group title", { exact: true }).fill("Air flow");
  await dialog.getByLabel("Search tags").fill("Array[0]");
  await dialog.getByLabel("Include Array[0]", { exact: true }).uncheck();
  await dialog.getByLabel("Search tags").fill("Array[99]");
  await dialog.getByLabel("Include Array[99]", { exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(
    page.locator(".tag-group").first().locator(".tag-row"),
  ).toHaveCount(4);
  await expect(page.locator(".tag-group").first()).toContainText(
    "Numeric Control [99]",
  );
  await page.reload();
  await expect(page.getByLabel("Dashboard title")).toHaveValue(
    "Combustion monitor",
  );
  await expect(page.getByLabel("Graph title")).toHaveValue(
    "Temperatures and pressure",
  );
  await expect(page.getByLabel("Group title 1", { exact: true })).toHaveValue(
    "Air flow",
  );
  await expect(
    page.getByLabel("Show Array[4]", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Configure Traces", exact: true })
    .click();
  await dialog.getByLabel("Search tags").fill("Array[4]");
  await expect(
    dialog.getByLabel("Color Array[4]", { exact: true }),
  ).toHaveValue("#ff8800");
  await dialog.getByLabel("Include Array[4]", { exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".trace-chip")).toHaveCount(4);
  await page.getByRole("button", { name: "Add group", exact: true }).click();
  await expect(page.locator(".tag-group")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Edit New group", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Delete group", exact: true })
    .click();
  await expect(page.locator(".tag-group")).toHaveCount(4);
  await page.getByLabel("Time window", { exact: true }).selectOption("60");
  await page.getByLabel("Time display", { exact: true }).selectOption("clock");
  await page
    .getByRole("checkbox", { name: "Auto scale", exact: true })
    .uncheck();
  await page.getByLabel("Y minimum").fill("10");
  await page.getByLabel("Y maximum").fill("5");
  await expect(page.getByRole("alert")).toContainText("minimum must be less");
  const size = await page.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
  }));
  expect(size.width).toBeLessThanOrEqual(size.viewport);
  expect(errors).toEqual([]);
});

test("connection guide and live-only workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".trace-chip")).toHaveCount(4);
  await page.getByRole("button", { name: "Connection", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("XML_SERVICE_URL");
  await expect(dialog).toContainText("Random_Number(GET)");
  await expect(dialog).toContainText("npm.cmd start");
  await expect(dialog).toContainText("No readings are recorded to disk");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^(Start|Stop|Export CSV|History)$/ }),
  ).toHaveCount(0);
  expect(
    (await page.request.get("/api/history?tag=Array%5B0%5D&from=0")).status(),
  ).toBe(404);
});

test("failed XML connection shows stale data without silently using demo", async ({
  page,
}) => {
  await page.route("**/api/snapshot", (route) =>
    route.fulfill({
      json: {
        tags: [
          {
            id: "P1",
            name: "Pressure",
            value: 7,
            unit: "bar",
            min: 0,
            max: 10,
            description: "",
            timestamp: 1000,
            quality: "good",
          },
        ],
        status: {
          mode: "xml",
          connected: false,
          lastSuccess: 1000,
          error: "XML service returned HTTP 503.",
          pollIntervalMs: 2000,
        },
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".connection")).toContainText("XML disconnected");
  await expect(page.getByRole("alert")).toContainText("Values are stale");
  await expect(page.locator(".tag-row").first()).toContainText("7.000");
  await expect(page.locator(".chart-note").first()).toContainText(
    "Waiting for live samples",
  );
});
