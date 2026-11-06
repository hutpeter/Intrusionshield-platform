import { test } from "node:test";
import assert from "node:assert/strict";
import bwipjs from "bwip-js/node";
import zxing from "@zxing/library";
const {
  MultiFormatReader,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  DecodeHintType,
  BarcodeFormat,
} = zxing;
for (const token of [
  "RSP-I-A7F4B902-0101-4BE1-8001-000000000003",
  "RSP-P-A7F4B902-0101-4BE1-8001-000000000003-V1",
])
  test("Data Matrix independently decodes " + token.slice(0, 6), () => {
    const symbol = bwipjs.raw({ bcid: "datamatrix", text: token })[0];
    assert.ok("pixs" in symbol);
    const scale = 4,
      quiet = 4,
      w = (symbol.pixx + quiet * 2) * scale,
      h = (symbol.pixy + quiet * 2) * scale,
      pixels = new Uint8ClampedArray(w * h).fill(255);
    for (let y = 0; y < symbol.pixy; y++)
      for (let x = 0; x < symbol.pixx; x++)
        if (symbol.pixs[y * symbol.pixx + x])
          for (let yy = 0; yy < scale; yy++)
            for (let xx = 0; xx < scale; xx++)
              pixels[
                ((y + quiet) * scale + yy) * w + (x + quiet) * scale + xx
              ] = 0;
    const reader = new MultiFormatReader();
    reader.setHints(
      new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.DATA_MATRIX]]]),
    );
    const r = reader.decode(
      new BinaryBitmap(
        new HybridBinarizer(new RGBLuminanceSource(pixels, w, h)),
      ),
    );
    assert.equal(r.getText(), token);
    assert.equal(r.getBarcodeFormat(), BarcodeFormat.DATA_MATRIX);
    const svg = bwipjs.toSVG({
      bcid: "datamatrix",
      text: token,
      scale: 4,
      paddingwidth: 4,
      paddingheight: 4,
      backgroundcolor: "FFFFFF",
    });
    assert.match(svg, /<svg/);
    assert.doesNotMatch(
      svg.replace('xmlns="http://www.w3.org/2000/svg"', ""),
      /<script|<foreignObject|https?:/,
    );
  });
