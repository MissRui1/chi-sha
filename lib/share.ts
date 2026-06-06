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
    backgroundColor: "#f4f6f2",
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
  container.style.background = "#f4f6f2";
  container.style.color = "#20231f";
  container.style.fontFamily =
    "Arial, Helvetica, sans-serif";
  container.style.borderRadius = "28px";

  const hero = document.createElement("div");
  hero.style.background = "#263329";
  hero.style.color = "#f8faf6";
  hero.style.borderRadius = "24px";
  hero.style.padding = "24px";
  hero.style.marginBottom = "18px";
  container.appendChild(hero);

  const eyebrow = document.createElement("p");
  eyebrow.textContent = "吃啥 · 饮食日记";
  eyebrow.style.color = "rgba(248,250,246,.68)";
  eyebrow.style.fontSize = "13px";
  eyebrow.style.letterSpacing = "0";
  eyebrow.style.margin = "0 0 10px";
  hero.appendChild(eyebrow);

  const title = document.createElement("h1");
  title.textContent = "最近认真吃过的每一顿";
  title.style.fontSize = "32px";
  title.style.lineHeight = "1.15";
  title.style.margin = "0";
  hero.appendChild(title);

  const desc = document.createElement("p");
  desc.textContent = `${mealCount} 条记录 · 精确到秒`;
  desc.style.color = "rgba(248,250,246,.78)";
  desc.style.margin = "14px 0 0";
  hero.appendChild(desc);

  if (mealCount === 0) {
    const empty = document.createElement("div");
    empty.textContent = "还没有记录";
    empty.style.background = "#ffffff";
    empty.style.border = "1px solid rgba(47,68,48,.11)";
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
    groupTitle.style.color = "#687063";
    groupTitle.style.fontSize = "13px";
    groupTitle.style.fontWeight = "800";
    groupTitle.style.margin = "20px 0 10px";
    container.appendChild(groupTitle);

    group.items.forEach((meal) => {
      const card = document.createElement("div");
      card.style.background = "#ffffff";
      card.style.borderRadius = "20px";
      card.style.padding = "18px";
      card.style.marginBottom = "12px";
      card.style.border = "1px solid rgba(47,68,48,.11)";
      card.style.boxShadow = "0 10px 24px rgba(47,68,48,.08)";
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
        img.style.borderRadius = "16px";
        img.style.marginBottom = "14px";
        card.appendChild(img);
      }

      const food = document.createElement("strong");
      food.textContent = meal.food;
      food.style.fontSize = "23px";
      food.style.lineHeight = "1.22";
      card.appendChild(food);

      const time = document.createElement("p");
      time.textContent = formatShareTime(meal);
      time.style.color = "#687063";
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
