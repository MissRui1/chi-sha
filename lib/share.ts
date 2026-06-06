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
  const firstMeal = visibleGroups[0]?.items[0];
  const lastGroup = visibleGroups[visibleGroups.length - 1];
  const lastMeal = lastGroup?.items[lastGroup.items.length - 1];
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "720px";
  container.style.padding = "42px";
  container.style.background =
    "linear-gradient(180deg, #f4f6f2 0%, #fff7ef 54%, #f7eee5 100%)";
  container.style.color = "#20231f";
  container.style.fontFamily =
    "Arial, 'Microsoft YaHei', Helvetica, sans-serif";
  container.style.border = "1px solid rgba(47,68,48,.12)";

  const hero = document.createElement("div");
  hero.style.position = "relative";
  hero.style.overflow = "hidden";
  hero.style.background =
    "linear-gradient(135deg, #20231f 0%, #304534 64%, #d8593c 160%)";
  hero.style.color = "#f8faf6";
  hero.style.borderRadius = "34px";
  hero.style.padding = "36px";
  hero.style.boxShadow = "0 24px 60px rgba(47,68,48,.18)";
  container.appendChild(hero);

  const eyebrow = document.createElement("p");
  eyebrow.textContent = "吃啥 · 可以发朋友圈的饮食小结";
  eyebrow.style.margin = "0 0 16px";
  eyebrow.style.color = "rgba(248,250,246,.7)";
  eyebrow.style.fontSize = "16px";
  hero.appendChild(eyebrow);

  const title = document.createElement("h1");
  title.textContent = buildShareTitle(mealCount);
  title.style.fontSize = "46px";
  title.style.lineHeight = "1.12";
  title.style.margin = "0";
  title.style.letterSpacing = "0";
  title.style.maxWidth = "520px";
  hero.appendChild(title);

  const desc = document.createElement("p");
  desc.textContent = buildShareDesc(mealCount, photoCount);
  desc.style.color = "rgba(248,250,246,.76)";
  desc.style.margin = "20px 0 0";
  desc.style.fontSize = "18px";
  desc.style.lineHeight = "1.7";
  desc.style.maxWidth = "560px";
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

  if (firstMeal && lastMeal) {
    const range = document.createElement("p");
    range.textContent = `从 ${formatShareDay(firstMeal)} 到 ${formatShareDay(lastMeal)}，这些饭把这一段日子串了起来。`;
    range.style.margin = "20px 0 0";
    range.style.color = "rgba(248,250,246,.62)";
    range.style.fontSize = "14px";
    range.style.lineHeight = "1.7";
    hero.appendChild(range);
  }

  if (mealCount === 0) {
    const empty = document.createElement("div");
    empty.textContent = "还没有记录";
    empty.style.background = "white";
    empty.style.borderRadius = "18px";
    empty.style.padding = "18px";
    container.appendChild(empty);
  }

  const timeline = document.createElement("div");
  timeline.style.position = "relative";
  timeline.style.marginTop = "34px";
  timeline.style.padding = "6px 0 0";
  container.appendChild(timeline);

  const mainRail = document.createElement("div");
  mainRail.style.position = "absolute";
  mainRail.style.left = "25px";
  mainRail.style.top = "0";
  mainRail.style.bottom = "0";
  mainRail.style.width = "3px";
  mainRail.style.borderRadius = "999px";
  mainRail.style.background =
    "linear-gradient(180deg, #d8593c 0%, #e3a72f 48%, rgba(88,122,99,.25) 100%)";
  timeline.appendChild(mainRail);

  groups.forEach((group) => {
    if (group.items.length === 0) {
      return;
    }

    const section = document.createElement("section");
    section.style.position = "relative";
    section.style.marginTop = "24px";
    section.style.paddingLeft = "62px";
    timeline.appendChild(section);

    const dot = document.createElement("div");
    dot.style.position = "absolute";
    dot.style.left = "13px";
    dot.style.top = "4px";
    dot.style.width = "26px";
    dot.style.height = "26px";
    dot.style.borderRadius = "999px";
    dot.style.background = "#d8593c";
    dot.style.border = "6px solid #fff7ef";
    dot.style.boxShadow = "0 8px 20px rgba(216,89,60,.22)";
    section.appendChild(dot);

    const groupTitle = document.createElement("h2");
    groupTitle.textContent = `${group.title} · ${group.items.length} 顿`;
    groupTitle.style.color = "#304534";
    groupTitle.style.fontSize = "18px";
    groupTitle.style.margin = "0 0 14px";
    groupTitle.style.letterSpacing = "0";
    section.appendChild(groupTitle);

    group.items.forEach((meal, index) => {
      const card = document.createElement("div");
      card.style.background = "white";
      card.style.borderRadius = "26px";
      card.style.padding = "16px";
      card.style.marginBottom = "14px";
      card.style.border = "1px solid rgba(47,68,48,.1)";
      card.style.overflow = "hidden";
      card.style.boxShadow = "0 14px 34px rgba(47,68,48,.09)";
      card.style.display = "grid";
      card.style.gridTemplateColumns = meal.imageUrl
        ? "138px 1fr"
        : "1fr";
      card.style.gap = "18px";
      card.style.alignItems = "center";
      card.style.position = "relative";

      const number = document.createElement("div");
      number.textContent = String(index + 1).padStart(2, "0");
      number.style.position = "absolute";
      number.style.right = "18px";
      number.style.top = "16px";
      number.style.color = "rgba(216,89,60,.18)";
      number.style.fontSize = "28px";
      number.style.fontWeight = "800";
      card.appendChild(number);

      if (meal.imageUrl) {
        const img = document.createElement("img");
        if (!meal.imageUrl.startsWith("data:")) {
          img.crossOrigin = "anonymous";
        }
        img.src = meal.imageUrl;
        img.alt = meal.food;
        img.style.display = "block";
        img.style.width = "100%";
        img.style.height = "138px";
        img.style.objectFit = "cover";
        img.style.borderRadius = "20px";
        card.appendChild(img);
      }

      const content = document.createElement("div");
      card.appendChild(content);

      const food = document.createElement("strong");
      food.textContent = meal.food;
      food.style.fontSize = "27px";
      food.style.lineHeight = "1.25";
      food.style.display = "block";
      food.style.paddingRight = "52px";
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

      const feeling = document.createElement("p");
      feeling.textContent = buildMealFeeling(meal);
      feeling.style.margin = "12px 0 0";
      feeling.style.color = "#687063";
      feeling.style.fontSize = "14px";
      feeling.style.lineHeight = "1.65";
      content.appendChild(feeling);

      section.appendChild(card);
    });
  });

  const footer = document.createElement("div");
  footer.style.margin = "34px 0 0";
  footer.style.padding = "24px";
  footer.style.background = "rgba(255,255,255,.72)";
  footer.style.border = "1px solid rgba(47,68,48,.1)";
  footer.style.borderRadius = "28px";
  footer.style.color = "#304534";
  footer.style.fontSize = "18px";
  footer.style.lineHeight = "1.75";
  footer.style.boxShadow = "0 14px 34px rgba(47,68,48,.08)";
  footer.textContent = buildFooterText(mealCount);
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

const buildMealFeeling = (meal: ShareMeal) => {
  if (meal.mood?.includes("奖励")) {
    return "这一顿像是给自己的一个小小肯定。";
  }

  if (meal.mood?.includes("emo")) {
    return "情绪不高的时候，能吃下一顿也很了不起。";
  }

  if (meal.mealTime?.includes("夜宵")) {
    return "深夜的一点热乎，把今天慢慢收住。";
  }

  if (meal.style?.includes("自主记录")) {
    return "这是自己主动记下的一顿，生活感很真实。";
  }

  return "这一顿被认真记录下来，就已经很有生活感。";
};

const buildFooterText = (mealCount: number) =>
  mealCount > 0
    ? "把饭吃好，不是为了证明什么，而是在提醒自己：这一段日子，我也有好好照顾自己。"
    : "日记还在等第一顿饭。等它开始以后，每一条记录都会成为生活的线索。";

const formatShareDay = (meal: ShareMeal) => {
  const date = new Date(meal.time);

  if (Number.isNaN(date.getTime())) {
    return "某一天";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: meal.timezone,
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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
