// Graph helpers over a sheet's province adjacency.
//
// Methods of TileSim (see tile-sim.js), installed with mixin().


export class Graph {
  ball(r0, radius) {
    const out = new Set([r0]);
    let frontier = [r0];
    for (let d = 0; d < radius; d++) {
      const next = [];
      for (const r of frontier) for (const o of this.R[r].adj) if (!out.has(o)) { out.add(o); next.push(o); }
      frontier = next;
    }
    return out;
  }

  distWithin(start, set) {
    const dist = new Map([[start, 0]]);
    const q = [start];
    for (let i = 0; i < q.length; i++) {
      for (const o of this.neighbours(q[i], 4)) {
        if (set.has(o) && !dist.has(o)) { dist.set(o, dist.get(q[i]) + 1); q.push(o); }
      }
    }
    return dist;
  }

  components(list) {
    const set = new Set(list), seen = new Set(), out = [];
    for (const r0 of list) {
      if (seen.has(r0)) continue;
      const comp = [r0];
      seen.add(r0);
      for (let i = 0; i < comp.length; i++) {
        for (const o of this.R[comp[i]].adj) if (set.has(o) && !seen.has(o)) { seen.add(o); comp.push(o); }
      }
      out.push(comp);
    }
    return out;
  }

  // split a connected set of provinces by people
  byCulture(comp) {
    const by = new Map();
    for (const r of comp) { const c = this.s.culture[r]; if (!by.has(c)) by.set(c, []); by.get(c).push(r); }
    return [...by.values()].flatMap((l) => this.components(l));
  }

  floodFill(arr, seeds, ok) {
    let frontier = seeds.slice();
    while (frontier.length) {
      this.rng.shuffle(frontier);
      const next = [];
      for (const r of frontier) {
        for (const o of this.neighbours(r, 3)) {
          if (arr[o] || !ok(o)) continue;
          arr[o] = arr[r];
          next.push(o);
        }
      }
      frontier = next;
    }
  }
}
