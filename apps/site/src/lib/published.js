// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// A post is published from its date on. Posts dated later are built only
// once that day comes; the deploy workflow rebuilds the site daily for this.
export const isPublished = (post, now = new Date()) => post.data.date <= now;
