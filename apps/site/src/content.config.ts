// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0
import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    author: z.string().default("The Conn3x team"),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    // Posts that share a series name list each other once they are live.
    series: z.string().optional(),
  }),
});

export const collections = { blog };
