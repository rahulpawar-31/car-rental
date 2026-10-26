import { test, expect } from "@playwright/test";

const CAR = {
  _id: "car1",
  brand: "Honda",
  model: "City",
  type: "sedan",
  year: 2024,
  color: "White",
  pricePerDay: 3000,
  securityDeposit: 0,
  seats: 5,
  fuelType: "petrol",
  transmission: "automatic",
  isAvailable: true,
  isFeatured: false,
  rating: 0,
  images: [],
  features: [],
};

const ok = (data) => ({ json: { success: true, data } });

// Serves every API call the browse flow makes from fixtures. Anything unexpected fails
// loudly (HTTP 500 with the URL) instead of hanging on a missing backend.
async function mockApi(page) {
  const unmocked = [];
  await page.route("**/api/v1/**", (route) => {
    const { pathname } = new URL(route.request().url());
    const path = pathname.replace(/^.*\/api\/v1/, "");

    if (path === "/cars") return route.fulfill(ok({ cars: [CAR], pagination: { page: 1, limit: 12, total: 1, pages: 1 } }));
    if (path === "/cars/featured") return route.fulfill(ok({ cars: [CAR] }));
    if (path === "/cars/filters") return route.fulfill(ok({ brands: ["Honda"], types: ["sedan"], fuelTypes: ["petrol"], priceRange: { min: 0, max: 10000 } }));
    if (path === `/cars/${CAR._id}`) return route.fulfill(ok({ car: CAR }));
    if (path === `/cars/${CAR._id}/booked-dates`) return route.fulfill(ok({ bookedRanges: [] }));
    if (path === `/reviews/car/${CAR._id}`) return route.fulfill(ok({ reviews: [] }));
    if (path === "/locations") return route.fulfill(ok({ locations: [] }));

    unmocked.push(path);
    return route.fulfill({ status: 500, json: { success: false, message: `Unmocked API call: ${path}` } });
  });
  return unmocked;
}

test("browse the fleet and open a car's detail page", async ({ page }) => {
  const unmocked = await mockApi(page);

  await page.goto("/cars");
  const card = page.getByRole("link", { name: /Honda City/ }).first();
  await expect(card).toBeVisible();

  await card.click();
  await expect(page).toHaveURL(/\/cars\/car1$/);
  await expect(page.getByRole("heading", { name: /Honda City/ }).first()).toBeVisible();
  await expect(page.getByText(/3,000/).first()).toBeVisible();

  // The detail page fires background calls (similar cars, booked dates, locations) that swallow
  // their errors, so let them settle before checking none hit the 500 fallback.
  await page.waitForLoadState("networkidle");
  expect(unmocked, "every API call in this flow should be mocked").toEqual([]);
});
