"""
[参照用 / REFERENCE COPY — runs on Windows with Edge + Playwright]
元ファイル: PC デスクトップ → fedex/fetch_fedex_billing.py

Hakee FedEx-laskujen summat FedEx Billing Centrestä (My Invoices).
（FedEx Billing Centre の My Invoices から請求金額を取得）

出力: fedex_billing_result.json, fedex_billing_page.txt

依存: pip install playwright ; playwright install
このコンテナ(Linux)では動きません。Windows 上で実行してください。
"""
import asyncio
import re
import json
from playwright.async_api import async_playwright

UNPAID = {
    "517145052", "517145182", "517146202", "517146959", "517147195",
    "517147280", "517147548", "517147868", "517148153", "517148910",
    "517149124", "517149234", "517149559", "517149785", "517150732",
    "517150920", "517151081", "517151333", "517151601", "517151893",
    "517152669", "517152884", "517153079", "517153392", "517153710",
    "517154086", "517154844",
}

EDGE_PATH = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
PROFILE_DIR = "C:/Users/Anu/AppData/Local/Microsoft/Edge/User Data"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(
            PROFILE_DIR,
            executable_path=EDGE_PATH,
            headless=False,
            channel="msedge",
            args=["--profile-directory=Default"],
        )

        page = browser.pages[0] if browser.pages else await browser.new_page()
        await page.goto("https://billing.fedex.com/")
        await page.wait_for_timeout(5000)

        try:
            invoices_link = page.get_by_text("My Invoices")
            if await invoices_link.count() > 0:
                await invoices_link.first.click()
                await page.wait_for_timeout(3000)
        except Exception:
            pass

        print("Sivu ladattu. Odotetaan 10s ja luetaan sisalto...")
        await page.wait_for_timeout(10000)

        body = await page.locator('body').inner_text()
        with open("fedex_billing_page.txt", "w", encoding="utf-8") as f:
            f.write(body)
        print(f"Sivun teksti tallennettu: fedex_billing_page.txt ({len(body)} merkkia)")

        lines = body.split('\n')
        found = {}
        for i, line in enumerate(lines):
            matches = re.findall(r'517\d{6}', line)
            for m in matches:
                context = '\n'.join(lines[max(0, i - 3):min(len(lines), i + 5)])
                amounts = re.findall(r'[\d,]+\.\d{2}', context)
                found[m] = amounts[-1] if amounts else "?"

        if found:
            print(f"\nLoydetyt laskut: {len(found)}")
            total = 0
            for inv_nr in sorted(found.keys()):
                status = "MAKSAMATTA" if inv_nr in UNPAID else "maksettu"
                amt = found[inv_nr]
                print(f"  {inv_nr}: {amt} EUR [{status}]")
                if inv_nr in UNPAID and amt != "?":
                    try:
                        total += float(amt.replace(',', ''))
                    except Exception:
                        pass
            print(f"\n MAKSAMATTA YHTEENSA: {total:,.2f} EUR")
        else:
            print("Ei loydetty laskutietoja sivulta. Tarkista selain manuaalisesti.")

        with open("fedex_billing_result.json", "w", encoding="utf-8") as f:
            json.dump(found, f, indent=2, ensure_ascii=False)

        print("\nOdotetaan 30s - tarkista selain...")
        await page.wait_for_timeout(30000)
        await browser.close()


asyncio.run(main())
