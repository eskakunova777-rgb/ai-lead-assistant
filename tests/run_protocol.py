import json, urllib.request, sys
S = [
 ("1. Целевой лид", "Анна Смирнова", "+7 900 111-22-33", "Здравствуйте! Я офис-менеджер компании “Альфа-Логистик”. Мы переезжаем в новый офис на 40 рабочих мест и хотим заказать поставку и сборку офисной мебели: столы, кресла и шкафы. Переезд в начале следующего месяца, бюджет около 1,5 млн рублей. Пришлите, пожалуйста, коммерческое предложение."),
 ("2. Нецелевой", "Олег Кузнецов", "oleg.kuznetsov@test.ru", "Ищем подрядчика на разработку мобильного приложения для доставки еды."),
 ("3. Жалоба", "Мария Лебедева", "+7 911 555-66-77", "Это уже третье письмо! Заказ должны были привезти в понедельник, сейчас четверг, ни мебели, ни звонка. Менеджер не берёт трубку. Если завтра ничего не изменится, будем отказываться и требовать возврат предоплаты."),
 ("4. Недостаточно данных", "Павел Орлов", "pavel.orlov@test.ru", "Сколько стоят офисные кресла? Нужно несколько штук."),
 ("5. Анонимизация", "Иван Петров", "+7 999 123-45-67", "Здравствуйте, я Иван Петров. Перезвоните мне на +7 999 123-45-67 или напишите на ivan.petrov@test.ru. Нужно 10 рабочих мест: столы и кресла, бюджет 500 тысяч."),
]
out = []
for title, name, contact, text in S:
    req = urllib.request.Request("http://localhost:3100/api/process", json.dumps({"name":name,"contact":contact,"text":text}).encode(), {"Content-Type":"application/json"})
    try: j = json.load(urllib.request.urlopen(req, timeout=170))
    except Exception as e: j = {"error": str(e)}
    out.append({"scenario": title, "name": name, "contact": contact, "text": text, "result": j})
    c = j.get("card", {})
    print(title, "|", c.get("lead_type"), "| human:", c.get("needs_human"), "|", j.get("bitrix"), j.get("error",""))
json.dump(out, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
