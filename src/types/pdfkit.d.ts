declare module 'pdfkit' {
  class PDFDocument {
    constructor(options?: any);
    text(text: string, x?: number, y?: number, options?: any): this;
    font(font: string): this;
    fontSize(size: number): this;
    fillColor(color: string): this;
    rect(x: number, y: number, width: number, height: number): this;
    roundedRect(x: number, y: number, width: number, height: number, radius: number): this;
    fill(color?: string | number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    strokeColor(color: string): this;
    lineWidth(width: number): this;
    stroke(): this;
    image(src: any, x?: number, y?: number, options?: any): this;
    end(): void;
    pipe(stream: any): void;
    on(event: string, callback: (...args: any[]) => void): this;
    page: {
      width: number;
      height: number;
    };
    bufferedPageRange(): { count: number };
    switchToPage(pageIndex: number): void;
    addPage(options?: any): this;
  }
  export = PDFDocument;
}
