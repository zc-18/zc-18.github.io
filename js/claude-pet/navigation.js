import * as THREE from '../lib/pet/three.module.js';
import { ROOM } from './studio.js';

// A rotation-independent envelope includes ears, raised paws and the curled tail.
export const PET_RADIUS = 2.15;
const STEP = .4;

export class RoomNavigation {
  constructor(boxes) {
    this.boxes = boxes.map(({ box }) => box);
    this.nodes = [];
    this.lookup = new Map();
    for (let z = ROOM.minZ + PET_RADIUS + .05, row = 0; z < ROOM.maxZ - PET_RADIUS; z += STEP, row++) {
      for (let x = ROOM.minX + PET_RADIUS + .05, col = 0; x < ROOM.maxX - PET_RADIUS; x += STEP, col++) {
        const point = new THREE.Vector3(x, 0, z);
        if (!this.isFree(point)) continue;
        const node = { point, col, row, neighbors: [] };
        this.nodes.push(node);
        this.lookup.set(`${col},${row}`, node);
      }
    }
    for (const node of this.nodes) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
      if (!x && !z) continue;
      const next = this.lookup.get(`${node.col + x},${node.row + z}`);
      if (next && this.clearLine(node.point, next.point)) node.neighbors.push(next);
    }
    // Only sample the connected floor reachable from the initial position.
    const seed = this.nearestNode(new THREE.Vector3());
    const connected = new Set([seed]), queue = [seed];
    for (let i = 0; i < queue.length; i++) for (const neighbor of queue[i].neighbors) {
      if (!connected.has(neighbor)) { connected.add(neighbor); queue.push(neighbor); }
    }
    this.nodes = this.nodes.filter(node => connected.has(node));
  }

  isFree(point, radius = PET_RADIUS) {
    const { x, z } = point;
    if (x < ROOM.minX + radius || x > ROOM.maxX - radius || z < ROOM.minZ + radius || z > ROOM.maxZ - radius) return false;
    return this.boxes.every(box => {
      const dx = x - THREE.MathUtils.clamp(x, box.min.x, box.max.x);
      const dz = z - THREE.MathUtils.clamp(z, box.min.z, box.max.z);
      return dx * dx + dz * dz >= radius * radius;
    });
  }

  clearLine(a, b, radius = PET_RADIUS) {
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / .12));
    const sample = new THREE.Vector3();
    for (let i = 0; i <= steps; i++) if (!this.isFree(sample.lerpVectors(a, b, i / steps), radius)) return false;
    return true;
  }

  nearestNode(point) {
    let best, distance = Infinity;
    for (const node of this.nodes) {
      const candidate = node.point.distanceToSquared(point);
      if (candidate < distance) { best = node; distance = candidate; }
    }
    return best;
  }

  nearest(point) {
    const node = this.nearestNode(point);
    return this.isFree(point) && this.clearLine(point, node.point) ? point.clone().setY(0) : node.point.clone();
  }

  sample(maxRadius = 5) {
    const choices = this.nodes.filter(node => node.point.length() < maxRadius);
    return choices[Math.floor(Math.random() * choices.length)].point.clone();
  }

  path(from, destination) {
    const goal = this.nearest(destination);
    if (this.clearLine(from, goal)) return [goal];
    const start = this.nearestNode(from), end = this.nearestNode(goal);
    const open = new Set([start]), closed = new Set(), previous = new Map();
    const cost = new Map([[start, 0]]), estimate = new Map([[start, start.point.distanceTo(goal)]]);
    while (open.size) {
      let current, smallest = Infinity;
      for (const node of open) if (estimate.get(node) < smallest) { current = node; smallest = estimate.get(node); }
      if (current === end) {
        const points = [goal];
        for (let node = end; node; node = previous.get(node)) points.unshift(node.point.clone());
        // Greedy visibility smoothing keeps turns continuous without cutting corners.
        const smooth = [];
        let anchor = from;
        for (let i = 0; i < points.length;) {
          let farthest = i;
          for (let j = points.length - 1; j > i; j--) if (this.clearLine(anchor, points[j])) { farthest = j; break; }
          smooth.push(points[farthest]); anchor = points[farthest]; i = farthest + 1;
        }
        return smooth;
      }
      open.delete(current); closed.add(current);
      for (const next of current.neighbors) {
        if (closed.has(next)) continue;
        const nextCost = cost.get(current) + current.point.distanceTo(next.point);
        if (nextCost >= (cost.get(next) ?? Infinity)) continue;
        previous.set(next, current); cost.set(next, nextCost);
        estimate.set(next, nextCost + next.point.distanceTo(goal)); open.add(next);
      }
    }
    return [from.clone()];
  }

  move(position, displacement) {
    // Sweep the full footprint in short steps, even after a slow/hidden browser frame.
    const steps = Math.max(1, Math.ceil(displacement.length() / .06));
    const step = displacement.clone().divideScalar(steps), candidate = new THREE.Vector3();
    for (let i = 0; i < steps; i++) {
      candidate.copy(position).add(step);
      if (this.isFree(candidate)) position.copy(candidate);
      else {
        candidate.copy(position); candidate.x += step.x;
        if (this.isFree(candidate)) position.copy(candidate);
        candidate.copy(position); candidate.z += step.z;
        if (this.isFree(candidate)) position.copy(candidate);
      }
    }
  }
}
