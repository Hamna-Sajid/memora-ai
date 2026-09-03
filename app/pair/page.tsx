import PairClient from "@/app/pair/pair-client";

export default async function PairPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const tokenValue = (await searchParams).token;
  const token = Array.isArray(tokenValue) ? tokenValue[0] : tokenValue;
  return <PairClient token={token ?? ""} />;
}
