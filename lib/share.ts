import html2canvas from "html2canvas";

type ShareMeal = {
  food: string;
  time: string;
  timezone?: string;
  timeUnknown?: boolean;
  mealTime?: string;
  mood?: string;
  style?: string;
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
  const visibleGroups = groups.filter(
    (group) => group.items.length > 0
  );
  const mealCount = groups.reduce(
    (sum, group) => sum + group.items.length,
    0
  );
  const photoCount = groups.reduce(
    (sum, group) =>
      sum + group.items.filter((item) => item.imageUrl).length,
    0
  );
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "620px";
  container.style.padding = "34px";
  container.style.background =
    "linear-gradient(180deg, #f4f6f2 0%, #fff7ef 100%)";
  container.style.color = "#20231f";
  container.style.fontFamily =
    "Arial, 'Microsoft YaHei', Helvetica, sans-serif";
  container.style.border = "1px solid rgba(47,68,48,.12)";

  const hero = document.createElement("div");
  hero.style.background = "#20231f";
  hero.style.color = "#f8faf6";
  hero.style.borderRadius = "28px";
  hero.style.padding = "30px";
  hero.style.boxShadow = "0 20px 45px rgba(47,68,48,.16)";
  container.appendChild(hero);

  const eyebrow = document.createElement("p");
  eyebrow.textContent = "吃啥 · 阶段饮食记录";
  eyebrow.style.margin = "0 0 16px";
  eyebrow.style.color = "rgba(248,250,246,.7)";
  eyebrow.style.fontSize = "15px";
  hero.appendChild(eyebrow);

  const title = document.createElement("h1");
  title.textContent = buildShareTitle(mealCount);
  title.style.fontSize = "38px";
  title.style.lineHeight = "1.18";
  title.style.margin = "0";
  title.style.letterSpacing = "0";
  hero.appendChild(title);

  const desc = document.createElement("p");
  desc.textContent = buildShareDesc(mealCount, photoCount);
  desc.style.color = "rgba(248,250,246,.76)";
  desc.style.margin = "18px 0 0";
  desc.style.fontSize = "17px";
  desc.style.lineHeight = "1.7";
  hero.appendChild(desc);

  const stats = document.createElement("div");
  stats.style.display = "grid";
  stats.style.gridTemplateColumns = "repeat(3, 1fr)";
  stats.style.gap = "10px";
  stats.style.marginTop = "24px";
  hero.appendChild(stats);

  [
    ["记录", `${mealCount} 顿`],
    ["照片", `${photoCount} 张`],
    ["阶段", visibleGroups[0]?.title ?? "日常"],
  ].forEach(([label, value]) => {
    const stat = document.createElement("div");
    stat.style.background = "rgba(255,255,255,.1)";
    stat.style.border = "1px solid rgba(255,255,255,.12)";
    stat.style.borderRadius = "16px";
    stat.style.padding = "14px";

    const statLabel = document.createElement("p");
    statLabel.textContent = label;
    statLabel.style.margin = "0 0 8px";
    statLabel.style.fontSize = "12px";
    statLabel.style.color = "rgba(248,250,246,.58)";
    stat.appendChild(statLabel);

    const statValue = document.createElement("strong");
    statValue.textContent = value;
    statValue.style.fontSize = "19px";
    statValue.style.fontWeight = "700";
    stat.appendChild(statValue);
    stats.appendChild(stat);
  });

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

    const section = document.createElement("section");
    section.style.position = "relative";
    section.style.marginTop = "28px";
    section.style.paddingLeft = "34px";
    container.appendChild(section);

    const rail = document.createElement("div");
    rail.style.position = "absolute";
    rail.style.left = "10px";
    rail.style.top = "10px";
    rail.style.bottom = "6px";
    rail.style.width = "2px";
    rail.style.background =
      "linear-gradient(180deg, #d8593c, rgba(88,122,99,.2))";
    section.appendChild(rail);

    const dot = document.createElement("div");
    dot.style.position = "absolute";
    dot.style.left = "3px";
    dot.style.top = "6px";
    dot.style.width = "16px";
    dot.style.height = "16px";
    dot.style.borderRadius = "999px";
    dot.style.background = "#d8593c";
    dot.style.border = "4px solid #fff7ef";
    section.appendChild(dot);

    const groupTitle = document.createElement("h2");
    groupTitle.textContent = group.title;
    groupTitle.style.color = "#587a63";
    groupTitle.style.fontSize = "16px";
    groupTitle.style.margin = "0 0 12px";
    groupTitle.style.letterSpacing = "0";
    section.appendChild(groupTitle);

    group.items.forEach((meal) => {
      const card = document.createElement("div");
      card.style.background = "white";
      card.style.borderRadius = "22px";
      card.style.padding = "14px";
      card.style.marginBottom = "12px";
      card.style.border = "1px solid rgba(47,68,48,.09)";
      card.style.overflow = "hidden";
      card.style.boxShadow = "0 12px 28px rgba(47,68,48,.08)";
      card.style.display = "grid";
      card.style.gridTemplateColumns = meal.imageUrl
        ? "116px 1fr"
        : "1fr";
      card.style.gap = "16px";
      card.style.alignItems = "center";

      if (meal.imageUrl) {
        const img = document.createElement("img");
        if (!meal.imageUrl.startsWith("data:")) {
          img.crossOrigin = "anonymous";
        }
        img.src = meal.imageUrl;
        img.alt = meal.food;
        img.style.display = "block";
        img.style.width = "100%";
        img.style.height = "116px";
        img.style.objectFit = "cover";
        img.style.borderRadius = "16px";
        card.appendChild(img);
      }

      const content = document.createElement("div");
      card.appendChild(content);

      const food = document.createElement("strong");
      food.textContent = meal.food;
      food.style.fontSize = "24px";
      food.style.lineHeight = "1.25";
      content.appendChild(food);

      const time = document.createElement("p");
      time.textContent = formatShareTime(meal);
      time.style.color = "#687063";
      time.style.margin = "8px 0 0";
      time.style.fontSize = "13px";
      content.appendChild(time);

      const meta = document.createElement("p");
      meta.textContent = [meal.mealTime, meal.mood, meal.style]
        .filter(Boolean)
        .join(" · ");
      meta.style.color = "#98a08f";
      meta.style.margin = "10px 0 0";
      meta.style.fontSize = "13px";

      if (meta.textContent) {
        content.appendChild(meta);
      }

      section.appendChild(card);
    });
  });

  const footer = document.createElement("p");
  footer.textContent =
    "每一顿认真吃过的饭，都是生活慢慢恢复秩序的证据。";
  footer.style.margin = "30px 4px 0";
  footer.style.color = "#687063";
  footer.style.fontSize = "15px";
  footer.style.lineHeight = "1.7";
  container.appendChild(footer);

  document.body.appendChild(container);
  return container;
};

const buildShareTitle = (mealCount: number) =>
  mealCount > 0
    ? `最近认真吃过 ${mealCount} 顿饭`
    : "最近的饮食日记";

const buildShareDesc = (
  mealCount: number,
  photoCount: number
) => {
  if (mealCount === 0) {
    return "先把第一顿好好吃完，日记就会开始长出来。";
  }

  if (photoCount > 0) {
    return `有 ${photoCount} 张照片留下了当时的味道，也留下了认真照顾自己的痕迹。`;
  }

  return "没有照片也没关系，文字同样能把这一段生活记住。";
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
