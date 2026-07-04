import { Nav, Footer, PageHeader } from "@/components/marketing/site-chrome";
import { DemoInterview } from "@/components/marketing/DemoInterview";

export const metadata = {
  title: "Live demo",
  description: "This is exactly what a respondent sees. Try a 60-second live interview yourself.",
};

export default function DemoPage() {
  return (
    <>
      <Nav />
      <PageHeader
        eyebrow="60-second live demo"
        title={<>Pretend you're a user.</>}
        lede="This is exactly what a respondent sees. The interviewer probes, tracks coverage, and knows when to stop. Type a few replies and get a feel."
      />
      <DemoInterview />
      <Footer />
    </>
  );
}
