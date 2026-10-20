import { Device, TrustStatus } from "./types";
import { nowIso } from "./crypto";

export class DeviceRegistry {
  private devices = new Map<string, Device>();

  enroll(device: Device): void {
    this.devices.set(device.device_id, device);
  }

  get(device_id: string): Device | undefined {
    return this.devices.get(device_id);
  }

  setTrust(device_id: string, status: TrustStatus): void {
    const d = this.devices.get(device_id);
    if (!d) throw new Error(`unknown device ${device_id}`);
    d.trust.status = status;
    d.trust.last_seen_at = nowIso();
    if (status === "revoked") d.trust.revoked_at = nowIso();
  }

  /** A device can execute only when enrolled, healthy (or degraded), and not revoked. */
  executable(device_id: string): { ok: boolean; reason: string } {
    const d = this.devices.get(device_id);
    if (!d) return { ok: false, reason: "device not enrolled" };
    if (d.trust.status === "revoked") return { ok: false, reason: "device trust revoked locally" };
    if (d.trust.status === "unseen") return { ok: false, reason: "device never seen" };
    return { ok: true, reason: "ok" };
  }
}
