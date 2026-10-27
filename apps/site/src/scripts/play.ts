// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Plays the diagrams. A diagram is an element with data-play="<cycle ms>";
// inside it, anything with data-at="<ms>" gets the class "on" at that time
// in the cycle. At the end of a cycle the diagram fades, resets and starts
// again, and it only runs while it's on screen.
//
// The resting styles are the finished picture. "armed" is what hides the
// pieces until their turn, and it's only added here, so without JavaScript
// or with reduced motion the diagram shows complete and still.

const HOLD_FADE = 450;

function player(root: HTMLElement) {
  const cycle = Number(root.dataset.play) || 10000;
  const items = [...root.querySelectorAll<HTMLElement | SVGElement>("[data-at]")].map(
    (el) => [el, Number(el.dataset.at)] as const,
  );
  let timers: number[] = [];

  const clear = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  const run = () => {
    clear();
    root.classList.remove("rewind");
    items.forEach(([el]) => el.classList.remove("on"));
    root.classList.add("armed", "play");
    for (const [el, at] of items) timers.push(window.setTimeout(() => el.classList.add("on"), at));
    timers.push(
      window.setTimeout(() => {
        root.classList.add("rewind");
        timers.push(window.setTimeout(run, HOLD_FADE));
      }, cycle),
    );
  };
  const stop = () => {
    clear();
    root.classList.remove("armed", "play", "rewind");
    items.forEach(([el]) => el.classList.add("on"));
  };
  return { run, stop };
}

export function play() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const roots = document.querySelectorAll<HTMLElement>("[data-play]");
  if (!roots.length) return;
  const players = new Map<Element, ReturnType<typeof player>>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const p = players.get(e.target)!;
        if (e.isIntersecting) p.run();
        else p.stop();
      }
    },
    { threshold: 0.3 },
  );
  roots.forEach((r) => {
    players.set(r, player(r));
    io.observe(r);
  });
}
