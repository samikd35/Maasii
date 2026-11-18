import { getPublishedMenu, publicActor } from "@/core";

export async function GET(request: Request, { params }: RouteContext<"/v/[token]/menu/search">) {
  const { token } = await params;
  const language = new URL(request.url).searchParams.get("language") === "am" ? "am" : "en";
  const menu = await getPublishedMenu(publicActor, { venueLinkToken: token, language });
  if (!menu) return new Response(null, { status: 404 });
  return Response.json(Object.fromEntries(menu.sections.flatMap(({ dishes }) =>
    dishes.map(({ id, name, description }) => [id, `${name} ${description}`]),
  )));
}
