const MAX_RATING = 5;

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

export function clampRating(value, max = MAX_RATING) {
  const num = toNumber(value);
  if (num < 0) return 0;
  if (num > max) return max;
  return num;
}

export function calculateAverageRating(list, precision = 1) {
  if (!Array.isArray(list) || list.length === 0) return 0;

  const sum = list.reduce(
    (acc, item) => acc + clampRating(item?.rating ?? item),
    0
  );
  const average = sum / list.length;

  // Fixed decimal but returned as number for easier math.
  const rounded = Number(average.toFixed(precision));
  return Number.isFinite(rounded) ? rounded : 0;
}

export function buildRatingDistribution(list, max = MAX_RATING) {
  const distribution = {};
  for (let i = 1; i <= max; i += 1) {
    distribution[i] = 0;
  }

  if (!Array.isArray(list)) return distribution;

  list.forEach((item) => {
    const score = Math.round(clampRating(item?.rating ?? item, max));
    if (score >= 1 && score <= max) {
      distribution[score] += 1;
    }
  });

  return distribution;
}

export function summarizeRatings(list, max = MAX_RATING) {
  const ratings = Array.isArray(list) ? list : [];
  const count = ratings.length;

  return {
    count,
    average: calculateAverageRating(ratings),
    distribution: buildRatingDistribution(ratings, max),
  };
}
