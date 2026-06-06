import html2canvas from "html2canvas";

type ShareMeal = {
  food: string;
  time: string;
  timezone?: string;
  timeUnknown?: boolean;
  imageUrl?: string;
};

type ShareMealGroup = {
  title: string;
  items: ShareMeal[];
};

export async function exportMealWall(
  fallbackMeals: ShareMealGroup[] | ShareMeal[]
): Promise<Blob> {
  const element = createFallbackWall(fallbackMeals);
  await waitForImages(element);

  const canvas = await html2canvas(element, {
    backgroundColor: "#f5f5f7",
    scale: 2,
    useCORS: true,
  });

  element.remove();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Image export failed"));
      }
    }, "image/png");
  });
}

const normalizeMealGroups = (
  meals: ShareMealGroup[] | ShareMeal[]
): ShareMealGroup[] => {
  if (
    meals.length > 0 &&
    "items" in meals[0]
  ) {
    return meals as ShareMealGroup[];
  }

  return [
    {
      title: "饮食日记",
      items: meals as ShareMeal[],
    },
  ];
};

const createFallbackWall = (
  meals: ShareMealGroup[] | ShareMeal[]
) => {
  const groups = normalizeMealGroups(meals);
  const mealCount = groups.reduce(
    (sum, group) => sum + group.items.length,
    0
  );
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "540px";
  container.style.padding = "32px";
  container.style.background = "#f5f5f7";
  container.style.color = "#111111";
  container.style.fontFamily =
    "Arial, Helvetica, sans-serif";

  const title = document.createElement("h1");
  title.textContent = "吃啥 · 饮食日记";
  title.style.fontSize = "32px";
  title.style.margin = "0 0 8px";
  container.appendChild(title);

  const desc = document.createElement("p");
  desc.textContent = "最近认真吃过的每一顿";
  desc.style.color = "#666";
  desc.style.margin = "0 0 24px";
  container.appendChild(desc);

  if (mealCount === 0) {
    const empty = document.createElement("div");
    empty.textContent = "还没有记录";
    empty.style.background = "white";
    empty.style.borderRadius = "18px";
    empty.style.padding = "18px";
    container.appendChild(empty);
  }

  groups.forEach((group) => {
    if (group.items.length === 0) {
      return;
    }

    const groupTitle = document.createElement("h2");
    groupTitle.textContent = group.title;
    groupTitle.style.color = "#777";
    groupTitle.style.fontSize = "14px";
    groupTitle.style.margin = "20px 0 10px";
    container.appendChild(groupTitle);

    group.items.forEach((meal) => {
      const card = document.createElement("div");
      card.style.background = "white";
      card.style.borderRadius = "18px";
      card.style.padding = "18px";
      card.style.marginBottom = "12px";
      card.style.border = "1px solid rgba(0,0,0,.06)";
      card.style.overflow = "hidden";

      if (meal.imageUrl) {
        const img = document.createElement("img");
        if (!meal.imageUrl.startsWith("data:")) {
          img.crossOrigin = "anonymous";
        }
        img.src = meal.imageUrl;
        img.alt = meal.food;
        img.style.display = "block";
        img.style.width = "100%";
        img.style.maxHeight = "320px";
        img.style.objectFit = "cover";
        img.style.borderRadius = "14px";
        img.style.marginBottom = "14px";
        card.appendChild(img);
      }

      const food = document.createElement("strong");
      food.textContent = meal.food;
      food.style.fontSize = "22px";
      card.appendChild(food);

      const time = document.createElement("p");
      time.textContent = formatShareTime(meal);
      time.style.color = "#777";
      time.style.margin = "8px 0 0";
      card.appendChild(time);

      container.appendChild(card);
    });
  });

  document.body.appendChild(container);
  return container;
};

const waitForImages = async (element: HTMLElement) => {
  const images = Array.from(element.querySelectorAll("img"));

  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          const finish = () => {
            if (!image.naturalWidth) {
              image.remove();
            }

            resolve();
          };

          if (image.complete) {
            finish();
            return;
          }

          image.onload = finish;
          image.onerror = finish;
        })
    )
  );
};

const formatShareTime = (meal: ShareMeal) => {
  const date = new Date(meal.time);

  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }

  const formatted = new Intl.DateTimeFormat("zh-CN", {
    timeZone: meal.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);

  return meal.timeUnknown
    ? `${formatted}（旧记录时间未知）`
    : formatted;
};

export async function shareMealWall(blob: Blob) {
  const file = new File(
    [blob],
    "chi-sha-meal-wall.png",
    { type: "image/png" }
  );

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: "吃啥 · 饮食日记",
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
