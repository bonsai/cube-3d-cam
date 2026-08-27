# Cube Camera Mode

MediaPipe Hands で手を検出し、3Dキューブを操作。

## 操作方法

| 手の動き | 効果 |
|---------|------|
| 手を左右に動かす | Y軸回転 |
| 手を上下に動かす | X軸回転 |
| 親指と人差し指の距離 | ズーム |

## 使い方

```bash
npm install
npm run dev
```

ブラウザでカメラを許可すると、手の動きでキューブが回転します。

## 仕組み

```
Webcam → MediaPipe Hands → 21 landmarks
  → wrist座標 → rotateX/Y
  → pinch距離 → zoom
  → Canvas描画
```
