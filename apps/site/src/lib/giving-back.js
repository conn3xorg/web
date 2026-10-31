// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

/** Time given to date, rounded to the nearest hour, from giving-back.json. */
export function hoursGiven(data) {
  const minutes = data.items.reduce((sum, i) => sum + i.minutes, data.otherMinutes);
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
