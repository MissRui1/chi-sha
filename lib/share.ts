import html2canvas from "html2canvas";

type ShareMeal = {
  food: string;
  time: string;
  imageUrl?: string;
};

export async function exportMealWall(
  fallbackMeals: ShareMeal[]
): Promise<Blob> {
  const element = createFallbackWall(fallbackMeals);

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

const createFallbackWall = (meals: ShareMeal[]) => {
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
  container.innerHTML = `
    <h1 style="font-size:32px;margin:0 0 8px;">吃啥 · 饮食日记</h1>
    <p style="color:#666;margin:0 0 24px;">最近认真吃过的每一顿</p>
    ${
      meals.length
        ? meals
            .map(
              (meal) => `
              <div style="background:white;border-radius:18px;padding:18px;margin-bottom:12px;border:1px solid rgba(0,0,0,.06);">
                <strong style="font-size:22px;">${meal.food}</strong>
                <p style="color:#777;margin:8px 0 0;">${formatShareTime(meal.time)}</p>
              </div>
            `
            )
            .join("")
        : "<div style='background:white;border-radius:18px;padding:18px;'>还没有记录</div>"
    }
  `;
  document.body.appendChild(container);
  return container;
};

const formatShareTime = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));

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
