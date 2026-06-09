"""
[参照用 / REFERENCE COPY — runs on Windows with Edge + Playwright]
元ファイル: PC デスクトップ → fedex/fetch_fedex_invoices.py

Hakee FedEx-laskunnumerot Gmailista (saapuneet + roskaposti).
Vertaa maksettuihin ja tulostaa maksamattomat.
（Gmail から FedEx 請求番号を収集し、支払済みリストと照合して未払いを出力）

出力: fedex_gmail_result.json  ({ all_gmail, paid, unpaid })

このコンテナ(Linux)では動きません。Windows 上で:
    pip install playwright
    playwright install
    python fetch_fedex_invoices.py
"""
import asyncio
import re
import json
from playwright.async_api import async_playwright

# Maksetut laskut (pankkitiliotteesta 2026) — 支払済み請求
PAID_INVOICES = {
    "517124822", "517130637", "517134551", "517133810", "517132928",
    "517130894", "517133525", "517129806", "517131701",
    "517135944", "517143225", "517141398", "517137431",
    "517141233", "517141033", "517139129", "517150069",
}

EDGE_PATH = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
PROFILE_DIR = "C:/Users/Anu/AppData/Local/Microsoft/Edge/User Data"


async def fetch_invoice_numbers(page, search_query, label):
    """Hae laskunnumerot Gmail-haulla."""
    print(f"\n--- {label}: '{search_query}' ---")

    search_box = page.locator('input[name="q"]')
    await search_box.click()
    await search_box.fill("")
    await search_box.fill(search_query)
    await search_box.press("Enter")
    await page.wait_for_timeout(3000)

    invoices = []
    rows = page.locator('[role="main"] tr')
    count = await rows.count()
    print(f"Riveja loytyi: {count}")

    for i in range(count):
        try:
            text = await rows.nth(i).inner_text()
            # FedEx invoice numbers: 9 digits starting with 517
            matches = re.findall(r'517\d{6}', text)
            for m in matches:
                if m not in invoices:
                    invoices.append(m)
        except Exception:
            pass

    print(f"Laskuja loytyi: {len(invoices)}")
    for inv in invoices:
        status = "MAKSETTU" if inv in PAID_INVOICES else "** EI MAKSETTU **"
        print(f"  {inv} - {status}")

    return invoices


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
        await page.goto("https://mail.google.com/mail/u/0/#inbox")
        await page.wait_for_timeout(5000)

        inbox_invoices = await fetch_invoice_numbers(
            page,
            "from:nordicinvhelp after:2026/01/01",
            "SAAPUNEET",
        )

        all_gmail = sorted(set(inbox_invoices))

        print("\n" + "=" * 60)
        print("YHTEENVETO")
        print("=" * 60)
        print(f"Gmail laskuja yhteensa: {len(all_gmail)}")
        print(f"Maksettuja: {len([i for i in all_gmail if i in PAID_INVOICES])}")

        unpaid = [i for i in all_gmail if i not in PAID_INVOICES]
        print(f"MAKSAMATTA: {len(unpaid)}")
        for inv in unpaid:
            print(f"  >> {inv}")

        result = {
            "all_gmail": all_gmail,
            "paid": [i for i in all_gmail if i in PAID_INVOICES],
            "unpaid": unpaid,
        }
        with open("fedex_gmail_result.json", "w") as f:
            json.dump(result, f, indent=2)

        print("\nTulokset tallennettu: fedex_gmail_result.json")
        await page.wait_for_timeout(30000)
        await browser.close()


asyncio.run(main())
