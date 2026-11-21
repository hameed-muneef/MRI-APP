export type HadithNarration = {
  id: string;
  number_in_collection: number;
  arabicnumber: number;
  book: number | null;
  text_arabic: string;
  narrator: string;
  grading_text: string;
};

export type HadithAsset = {
  collection: string;
  title: string;
  author: string;
  counts: {
    hadiths: number;
    books: number;
    sourceHadiths: number;
    omittedEmptyText: number;
  };
  sections: Record<string, string>;
  bookTitlesAr: Record<string, string>;
  hadiths: HadithNarration[];
};
