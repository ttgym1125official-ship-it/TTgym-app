// ビフォー・アフターの写真（前・横・後ろ）。目標設定ページとビフォーアフターページで共通
import React, { useRef, useState } from "react";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { post } from "./api.js";

const SIDES = [["", "正面"], ["_side", "横"], ["_back", "後ろ"]];

function PhotoSlot({ label, photo, busy, onSelect }) {
  const ref = useRef(null);
  return (
    <div className="lf-photo">
      <div className="lab">{label}</div>
      <button className={`slot${photo ? " has" : ""}`} onClick={() => ref.current?.click()}>
        {busy ? <LoaderCircle className="lf-spin" size={22} />
          : photo ? <img src={photo} alt={label} />
            : <span><ImagePlus size={22} strokeWidth={1.6} /><br />選択</span>}
      </button>
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onSelect(f); }} />
    </div>
  );
}

// 目標設定ページと共通：ビフォー・アフターを 前・横・後ろ の3枚ずつ
export function BeforeAfterPhotos({ photos, afterMonths, toast, onChange }) {
  const [busy, setBusy] = useState(null);
  const pick = async (slot, file) => {
    setBusy(slot);
    try {
      const { fileToCompressedDataUrl } = await import("../imageUtils.js");
      const dataUrl = await fileToCompressedDataUrl(file);
      await post("photo", { which: slot, dataUrl });
      onChange(slot, dataUrl);
    } catch (e) {
      toast("写真を保存できませんでした");
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {[["before", "ビフォー", "BEFORE"], ["after", `アフター${afterMonths ? `（${afterMonths}ヶ月）` : ""}`, "AFTER"]].map(([w, label, en], i) => (
        <div key={w} style={{ marginTop: i ? 16 : 0 }}>
          <div className="lf-ba-row"><i>{en}</i>{label}</div>
          <div className="lf-ba-grid">
            {SIDES.map(([suf, side]) => (
              <PhotoSlot key={suf} label={side} photo={photos[w + suf]} busy={busy === w + suf} onSelect={f => pick(w + suf, f)} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
