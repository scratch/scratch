import React from 'react';
import LottiePlayer from './LottiePlayer';

const easeOut = { x: [0.22, 0.22], y: [1, 1] };
const easeIn = { x: [0.42, 0.42], y: [0, 0] };

const baseTransform = {
  a: { a: 0, k: [0, 0] },
  p: { a: 0, k: [0, 0] },
  s: { a: 0, k: [100, 100] },
  r: { a: 0, k: 0 },
  o: { a: 0, k: 100 },
  sk: { a: 0, k: 0 },
  sa: { a: 0, k: 0 },
};

function shapeLayer(ind: number, name: string, shapes: unknown[]) {
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm: name,
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [0, 0, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 0, k: [100, 100, 100] },
    },
    ao: 0,
    shapes,
    ip: 0,
    op: 180,
    st: 0,
    bm: 0,
  };
}

const slidingPanelAnimation = {
  v: '5.12.2',
  fr: 60,
  ip: 0,
  op: 180,
  w: 720,
  h: 360,
  nm: 'Sliding panel explainer',
  ddd: 0,
  assets: [],
  layers: [
    shapeLayer(1, 'Track', [
      {
        ty: 'gr',
        nm: 'Track group',
        it: [
          {
            ty: 'rc',
            d: 1,
            s: { a: 0, k: [520, 92] },
            p: { a: 0, k: [360, 185] },
            r: { a: 0, k: 46 },
            nm: 'Track box',
          },
          {
            ty: 'fl',
            c: { a: 0, k: [0.94, 0.97, 0.99, 1] },
            o: { a: 0, k: 100 },
            r: 1,
            nm: 'Track fill',
          },
          {
            ty: 'st',
            c: { a: 0, k: [0.71, 0.79, 0.87, 1] },
            o: { a: 0, k: 100 },
            w: { a: 0, k: 3 },
            lc: 2,
            lj: 2,
            nm: 'Track stroke',
          },
          { ty: 'tr', ...baseTransform },
        ],
      },
    ]),
    shapeLayer(2, 'Destination halo', [
      {
        ty: 'gr',
        nm: 'Halo group',
        it: [
          {
            ty: 'el',
            p: { a: 0, k: [0, 0] },
            s: { a: 0, k: [184, 184] },
            nm: 'Halo ellipse',
          },
          {
            ty: 'fl',
            c: { a: 0, k: [0.78, 0.94, 1, 1] },
            o: { a: 0, k: 58 },
            r: 1,
            nm: 'Halo fill',
          },
          {
            ty: 'tr',
            ...baseTransform,
            p: { a: 0, k: [532, 185] },
            s: {
              a: 1,
              k: [
                { t: 0, s: [82, 82], e: [82, 82], i: easeOut, o: easeIn },
                { t: 42, s: [82, 82], e: [116, 116], i: easeOut, o: easeIn },
                { t: 92, s: [116, 116], e: [96, 96], i: easeOut, o: easeIn },
                { t: 142, s: [96, 96] },
              ],
            },
            o: {
              a: 1,
              k: [
                { t: 0, s: [0], e: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
                { t: 38, s: [0], e: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
                { t: 78, s: [100], e: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
                { t: 130, s: [100], e: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
                { t: 168, s: [0] },
              ],
            },
          },
        ],
      },
    ]),
    shapeLayer(3, 'Motion trail', [
      {
        ty: 'gr',
        nm: 'Trail group',
        it: [
          {
            ty: 'sh',
            ks: {
              a: 0,
              k: {
                i: [
                  [0, 0],
                  [0, 0],
                ],
                o: [
                  [0, 0],
                  [0, 0],
                ],
                v: [
                  [250, 185],
                  [470, 185],
                ],
                c: false,
              },
            },
            nm: 'Trail path',
          },
          {
            ty: 'st',
            c: { a: 0, k: [0.06, 0.65, 0.82, 1] },
            o: { a: 0, k: 100 },
            w: { a: 0, k: 8 },
            lc: 2,
            lj: 2,
            nm: 'Trail stroke',
          },
          {
            ty: 'tr',
            ...baseTransform,
            o: {
              a: 1,
              k: [
                { t: 0, s: [0], e: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
                { t: 35, s: [0], e: [76], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
                { t: 88, s: [76], e: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
                { t: 120, s: [0] },
              ],
            },
          },
        ],
      },
    ]),
    shapeLayer(4, 'Moving panel', [
      {
        ty: 'gr',
        nm: 'Panel group',
        it: [
          {
            ty: 'rc',
            d: 1,
            s: { a: 0, k: [170, 112] },
            p: { a: 0, k: [0, 0] },
            r: { a: 0, k: 18 },
            nm: 'Panel body',
          },
          {
            ty: 'fl',
            c: { a: 0, k: [0.02, 0.53, 0.74, 1] },
            o: { a: 0, k: 100 },
            r: 1,
            nm: 'Panel fill',
          },
          {
            ty: 'st',
            c: { a: 0, k: [0.73, 0.95, 1, 1] },
            o: { a: 0, k: 100 },
            w: { a: 0, k: 4 },
            lc: 2,
            lj: 2,
            nm: 'Panel stroke',
          },
          {
            ty: 'rc',
            d: 1,
            s: { a: 0, k: [106, 14] },
            p: { a: 0, k: [0, -23] },
            r: { a: 0, k: 7 },
            nm: 'Top line',
          },
          {
            ty: 'fl',
            c: { a: 0, k: [0.89, 0.99, 1, 1] },
            o: { a: 0, k: 92 },
            r: 1,
            nm: 'Line fill 1',
          },
          {
            ty: 'rc',
            d: 1,
            s: { a: 0, k: [72, 12] },
            p: { a: 0, k: [-17, 14] },
            r: { a: 0, k: 6 },
            nm: 'Bottom line',
          },
          {
            ty: 'fl',
            c: { a: 0, k: [0.89, 0.99, 1, 1] },
            o: { a: 0, k: 72 },
            r: 1,
            nm: 'Line fill 2',
          },
          {
            ty: 'tr',
            ...baseTransform,
            p: {
              a: 1,
              k: [
                { t: 0, s: [185, 185], e: [185, 185], i: easeOut, o: easeIn },
                { t: 28, s: [185, 185], e: [532, 185], i: easeOut, o: easeIn },
                { t: 96, s: [532, 185], e: [532, 185], i: easeOut, o: easeIn },
                { t: 142, s: [532, 185], e: [185, 185], i: easeOut, o: easeIn },
                { t: 180, s: [185, 185] },
              ],
            },
            s: {
              a: 1,
              k: [
                { t: 0, s: [100, 100], e: [100, 100], i: easeOut, o: easeIn },
                { t: 32, s: [96, 104], e: [104, 98], i: easeOut, o: easeIn },
                { t: 76, s: [104, 98], e: [100, 100], i: easeOut, o: easeIn },
                { t: 104, s: [100, 100] },
              ],
            },
          },
        ],
      },
    ]),
  ],
  markers: [
    { tm: 0, cm: 'before', dr: 30 },
    { tm: 35, cm: 'transition', dr: 70 },
    { tm: 105, cm: 'settled', dr: 40 },
  ],
};

const beats = [
  {
    label: '1. Stable start',
    detail: 'The panel rests long enough for the viewer to identify the object before motion begins.',
  },
  {
    label: '2. Eased travel',
    detail: 'Position keyframes use easing, so the slide feels intentional instead of mechanical.',
  },
  {
    label: '3. Arrival cue',
    detail: 'A destination halo and subtle scale change show where attention should land.',
  },
];

export function SlidingAnimationExplainer() {
  return (
    <section className="not-prose scratch-lottie-demo">
      <div className="scratch-lottie-demo-grid">
        <LottiePlayer
          title="Sliding panel: before, transition, settled"
          animationData={slidingPanelAnimation}
          caption="A tiny Lottie JSON file can carry position, easing, opacity, and shape changes as one reusable explainer asset."
        />
        <div className="scratch-lottie-notes">
          <p className="scratch-section-label">Why this works</p>
          <h3>Motion explains the state change, not just the final state.</h3>
          <dl>
            {beats.map((beat) => (
              <div key={beat.label}>
                <dt>{beat.label}</dt>
                <dd>{beat.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

export default SlidingAnimationExplainer;
