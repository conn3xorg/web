// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// A post is published from 14:00 UTC on its date, 7 a.m. Mountain Standard
// Time, so a merge the evening before doesn't put tomorrow's post up early.
// The deploy workflow rebuilds the site just after that hour each day.
const PUBLISH_HOUR_UTC = 14;

export const isPublished = (post, now = new Date()) =>
  post.data.date.valueOf() + PUBLISH_HOUR_UTC * 3600e3 <= now.valueOf();
