#!/usr/bin/env python3
"""
Genera el atajo de iPhone "Registrar gasto" (.shortcut) listo para instalar.

Uso:
  python3 scripts/generar-atajo.py <SUPABASE_URL> <SUPABASE_ANON_KEY> salida-sin-firmar.shortcut
  shortcuts sign --mode anyone --input salida-sin-firmar.shortcut --output "public/atajo/Registrar gasto.shortcut"

Qué hace el atajo:
  1. Recibe el texto del pago (de la automatización "Transacción": "[Importe] | [Comercio]").
     Si lo ejecutas a mano, te pide el texto (ej: "12,50 almuerzo").
  2. Muestra el monto y pregunta "¿De qué cuenta salió?" (tus cuentas de la app, débito o crédito)
     y "¿En qué gastaste?" (categorías + "Después").
  3. Llama a registrar_gasto_atajo en Supabase con tu clave.
  4. Muestra la notificación con el mensaje de vuelta ("Te quedan $X de $Y").
Al instalarlo pide (pregunta de importación) solo tu clave del atajo.
"""
import plistlib
import sys
import uuid

CATEGORIAS = ['Comida', 'Supermercado', 'Transporte', 'Servicios', 'Arriendo', 'Entretenimiento',
              'Salidas', 'Salud', 'Compras', 'Educación', 'Suscripciones', 'Otros', 'Después']


def u():
    return str(uuid.uuid4()).upper()


def texto(*partes):
    """WFTextTokenString: mezcla de texto fijo y variables."""
    s, adj = '', {}
    for p in partes:
        if isinstance(p, str):
            s += p
        else:
            adj[f'{{{len(s.encode("utf-16-le")) // 2}, 1}}'] = p
            s += '￼'
    return {'Value': {'string': s, 'attachmentsByRange': adj}, 'WFSerializationType': 'WFTextTokenString'}


def salida(uuid_, nombre):
    return {'Type': 'ActionOutput', 'OutputUUID': uuid_, 'OutputName': nombre}


def adjunto(var):
    return {'Value': var, 'WFSerializationType': 'WFTextTokenAttachment'}


def variable(nombre):
    return {'Type': 'Variable', 'VariableName': nombre}


def diccionario(pares):
    return {
        'Value': {'WFDictionaryFieldValueItems': [
            {'WFItemType': 0, 'WFKey': texto(k), 'WFValue': v if isinstance(v, dict) and 'Value' in v else texto(v)}
            for k, v in pares
        ]},
        'WFSerializationType': 'WFDictionaryFieldValue',
    }


def accion(ident, params):
    return {'WFWorkflowActionIdentifier': ident, 'WFWorkflowActionParameters': params}


def main(url, anon, salida_archivo):
    t_clave, t_cuentas, t_cuenta, t_lista, t_elegir, t_url, t_valor = (u() for _ in range(7))
    base = url.rstrip('/') + '/rest/v1/rpc/'
    cabeceras = diccionario([('apikey', anon), ('Content-Type', 'application/json')])
    pago = {'Type': 'ExtensionInput'}
    acciones = [
        # 0-1: clave (pregunta de importación)
        accion('is.workflow.actions.gettext', {'UUID': t_clave, 'WFTextActionText': ''}),
        accion('is.workflow.actions.setvariable', {'WFVariableName': 'clave', 'WFInput': adjunto(salida(t_clave, 'Text'))}),
        # 2-3: ¿De qué cuenta salió? (la lista viene de la app)
        accion('is.workflow.actions.downloadurl', {
            'UUID': t_cuentas,
            'WFURL': base + 'cuentas_atajo',
            'WFHTTPMethod': 'POST', 'WFHTTPBodyType': 'JSON', 'ShowHeaders': True,
            'WFHTTPHeaders': cabeceras,
            'WFJSONValues': diccionario([('p_api_key', texto(variable('clave')))]),
        }),
        accion('is.workflow.actions.choosefromlist', {
            'UUID': t_cuenta,
            'WFInput': adjunto(salida(t_cuentas, 'Contents of URL')),
            'WFChooseFromListActionPrompt': texto(pago, '\n¿De qué cuenta salió?'),
        }),
        # 4-5: ¿En qué gastaste?
        accion('is.workflow.actions.list', {'UUID': t_lista, 'WFItems': CATEGORIAS}),
        accion('is.workflow.actions.choosefromlist', {
            'UUID': t_elegir,
            'WFInput': adjunto(salida(t_lista, 'List')),
            'WFChooseFromListActionPrompt': texto(pago, '\n¿En qué gastaste?'),
        }),
        # 6: registrar
        accion('is.workflow.actions.downloadurl', {
            'UUID': t_url,
            'WFURL': base + 'registrar_gasto_atajo',
            'WFHTTPMethod': 'POST', 'WFHTTPBodyType': 'JSON', 'ShowHeaders': True,
            'WFHTTPHeaders': cabeceras,
            'WFJSONValues': diccionario([
                ('p_api_key', texto(variable('clave'))),
                ('p_texto', texto(pago)),
                ('p_category', texto(salida(t_elegir, 'Chosen Item'))),
                ('p_account_name', texto(salida(t_cuenta, 'Chosen Item'))),
            ]),
        }),
        # 7-8: mensaje de vuelta → notificación
        accion('is.workflow.actions.getvalueforkey', {
            'UUID': t_valor,
            'WFInput': adjunto(salida(t_url, 'Contents of URL')),
            'WFGetDictionaryValueType': 'Value',
            'WFDictionaryKey': 'mensaje',
        }),
        accion('is.workflow.actions.notification', {
            'WFNotificationActionTitle': 'Mis Finanzas',
            'WFNotificationActionBody': texto(salida(t_valor, 'Dictionary Value')),
            'WFNotificationActionSound': True,
        }),
    ]

    atajo = {
        'WFWorkflowMinimumClientVersion': 900,
        'WFWorkflowMinimumClientVersionString': '900',
        'WFWorkflowClientVersion': '2605.0.5',
        'WFWorkflowIcon': {'WFWorkflowIconStartColor': 463140863, 'WFWorkflowIconGlyphNumber': 59446},
        'WFWorkflowTypes': [],
        'WFQuickActionSurfaces': [],
        'WFWorkflowHasShortcutInputVariables': True,
        'WFWorkflowInputContentItemClasses': [
            'WFStringContentItem', 'WFRichTextContentItem', 'WFNumberContentItem', 'WFGenericFileContentItem',
        ],
        'WFWorkflowNoInputBehavior': {
            'Name': 'WFWorkflowNoInputBehaviorAskForInput',
            'Parameters': {'ItemClass': 'WFStringContentItem'},
        },
        'WFWorkflowOutputContentItemClasses': [],
        'WFWorkflowImportQuestions': [
            {'ActionIndex': 0, 'Category': 'Parameter', 'ParameterKey': 'WFTextActionText', 'DefaultValue': '',
             'Text': 'Pega tu clave del atajo (en la app: Ajustes → Atajo de iPhone → Copiar mi clave)'},
        ],
        'WFWorkflowActions': acciones,
    }
    with open(salida_archivo, 'wb') as f:
        plistlib.dump(atajo, f, fmt=plistlib.FMT_BINARY)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    main(*sys.argv[1:])
